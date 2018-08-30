"use strict";

var Trader = require("./trader");
var PubNub = require('pubnub');

var request = require('request');
var crypto = require('crypto');
var fs = require("fs");
var config = JSON.parse(fs.readFileSync("./config_bitflyer.json"));


class BitflyerfxTrader extends Trader {
	constructor () {
		super( arguments[0] );
		this.pair = this.pair.toUpperCase();
	}

	unko () {
		console.warn("BitflyerfxTrader だよ");
	}

	/**
	 * 状態を最新にする.
	 */
	update_all ( callback ) {
		var self = this;
		self.update_balance(function(){
			self.update_positions(function(){
				callback();
			});
		});
	}

	/**
	 * 使えるお金を更新.
	 */
	update_balance ( callback ) {
		// console.log("update_balance");
		var self = this;
		this.__api_request("GET", "me/getcollateralaccounts", null, function( payload ){
			payload.forEach(function( item ){
				// console.log(item);
				switch ( item.currency_code ) {
					case "JPY":
						self.balance.jpy = item.amount;
						break;
					case "BTC":
						self.balance.btc = item.amount;
						break;
				}
			});
			callback();
		}, function( error ){
			throw Error("APIエラー");
		});
	}

	/**
	 * ポジション一覧を更新.
	 */
	update_positions ( callback ) {
		// console.log("update_positions");
		var self = this;
		var args = { product_code : this.pair };
		this.__api_request("GET", "me/getpositions", args, function( payload ){
			self.__positions = []; //一旦リセット.
			payload.forEach(function( item ){
				// console.log(item);
				self.__positions.push({
					id      : null,
					amount  : parseFloat(item.size),
					side    : item.side,
					pair    : item.product_code,
					price   : item.price,
					origin  : item,
				});
			});
			callback();
		}, function( error ){
			setTimeout(function(){
				console.log("retry, update_positions.");
				self.update_positions( callback );
			}, 3000);
			// throw Error("APIエラー");
		});
	}

	/**
	* アクティブなオーダーを削除.
	*/
	clear_active_orders ( callback ) {
		var self = this;
		var args = {
			product_code : self.pair,
		};
		self.__api_request("POST", "me/cancelallchildorders", args, function( payload ){
			if ( callback ) callback();
		});
	}
	
	/**
	 * Tickerストリーム.
	 */
	executionsTickerStream ( receiver ) {
		var self = this;
		this.__createStreamApi( 'lightning_ticker_' + self.pair.toUpperCase(), function( data ){
			receiver( data );
		} );
	}



	/**
	 * 売買.
	 */
	buy ( price, amount, success_callback, error_callback ) {
        // console.log("buy");
        this.__sellbuy_base("BUY", price, amount, success_callback, error_callback );
    }
	sell ( price, amount, success_callback, error_callback ) {
        // console.log("sell");
        this.__sellbuy_base("SELL", price, amount, success_callback, error_callback );
    }
    //sellとbuyの共通部分.
    __sellbuy_base ( side, price, amount, success_callback, error_callback ) {
        var self = this;
        var child_order_type = ( price == null ) ? "MARKET" : "LIMIT";
        var body = {
            product_code        : self.pair,
            child_order_type    : child_order_type,
            side                : side,
            price               : price,
            size                : amount,
            // minute_to_expire    : 20,
            time_in_force       : "GTC", // 執行数量条件.
        }
        self.__api_request("POST", "me/sendchildorder", body, function( payload ){
            // success.
            var child_order_acceptance_id = payload.child_order_acceptance_id
            var __check = function () {
                // 注文が通ったか確認.
                var body = {
                    product_code    : self.pair,
                    child_order_acceptance_id : child_order_acceptance_id,
                };
                self.__api_request("GET", "me/getchildorders", body, function( payload ){
                    if ( !payload.length ) {
                        setTimeout( __check, 3000 );
                    } else {
                        // 通った. 失敗してたり約定しなかったりするだろうけど、balanceは最新になるはず.
                        var order = payload[0];
                        console.log( order.side + " : " + order.child_order_state + ", " + order.average_price );
                        success_callback();
                    }
                });
            }
            if ( success_callback ) {
                __check();
            }
        }, function( error ){
            // error.
            if ( error_callback ) error_callback();
        });
    }


	/**
	 * Bitflyerのストリーミング配信を受け取る.
	 * https://lightning.bitflyer.jp/docs?lang=ja
	 */
	__createStreamApi ( channel, receiver){
		var pubnub = new PubNub({
			subscribeKey: 'sub-c-52a9ab50-291b-11e5-baaa-0619f8945a4f'
		});
		pubnub.addListener({
			message: function (data) {
				receiver( data );
			}
		});
		pubnub.subscribe({
			channels: [ channel ]
		});
	}

	/**
	 * Bitflyerにリクエスト投げる.
	 * ↓見ていい感じに指定して..
	 * https://lightning.bitflyer.jp/docs?lang=ja
	 */
	__api_request ( method, endpoint, body = {}, success_callback=null, error_callback=null ) {
		var key = config.apikey;
		var secret = config.apisecret;

		var timestamp = Date.now().toString();
		if ( !body ) body = {};

		if ( !method ) {
			method = "POST";
		}

		if ( method == "GET" ) {
			// GETの場合クエリパラメータとして付けないといけないので.
			// これは外でやるべきかもだけど、まぁ.
			for( var k in body ) {
				var sep = ( -1 < endpoint.indexOf("?") ) ? "&" : "?";
				endpoint += sep + k + "=" + body[k];
			}
		}

		body = JSON.stringify( body );
		
		var path = '/v1/' + endpoint; /// /v1/me/getbalance

		var text = timestamp + method + path + body;
		var sign = crypto.createHmac('sha256', secret).update(text).digest('hex');

		var options = {
			url: 'https://api.bitflyer.jp' + path,
			method: method,
			body: body,
			headers: {
				'ACCESS-KEY': key,
				'ACCESS-TIMESTAMP': timestamp,
				'ACCESS-SIGN': sign,
				'Content-Type': 'application/json'
			}
		};
		request(options, function (err, response, payload) {
			if ( err != null || response.statusCode < 200 || 300 <= response.statusCode ) {
				// payloadはパースできないかもしれないし、errは空かもしれないし.
				// けどpayloadに重要なヒントが入ってたりするしで何返そうか悩んでこうなった.
				console.log(payload);
				error_callback( err, response, payload );
				return;
			} else {
				var body = ( payload ) ? JSON.parse(payload) : {};
				success_callback( body, response );
			}
		});
	}

}
module.exports = BitflyerfxTrader;