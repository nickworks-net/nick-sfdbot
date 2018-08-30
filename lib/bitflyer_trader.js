"use strict";

var Trader = require("./trader");
var PubNub = require('pubnub');

var fs = require("fs");
var config = JSON.parse(fs.readFileSync("./config_bitflyer.json"));

class BitflyerTrader extends Trader {
    constructor () {
        super( arguments[0] );
        this.pair = this.pair.toUpperCase(); //ここで大文字にしちゃう.
        this.taker_fee_rate = 0.15;
    }

    hoge () {
        console.warn("bitflyer traderだよ");
    }

    /**
     * 状態を最新にする.
     */
    update_all ( callback ) {
        var self = this;
        self.update_fee(function(){
            self.update_balance(function(){
                callback();
            });
        });
    }

    /**
     * 使えるお金を更新.
     */
    update_balance ( callback ) {
        console.log("update_balance");
        var self = this;
        this.__api_request("GET", "me/getbalance", null, function( payload ){
            payload.forEach(function( item ){
                // console.log(item);
                switch ( item.currency_code ) {
                    case "JPY":
                        // ギリギリ狙いたいけど、取引時に（たぶん手数料分で）残高足りないとか言われちゃうので
                        // 予め適当に残高減らしておく.
                        // item.available = item.available - 4000;
                        self.balance.jpy = Math.max(item.available, 0);
                        break;
                    case "BTC":
                        // ギリギリ狙いたいけど、取引時に（たぶん手数料分で）残高足りないとか言われちゃうので
                        // 予め適当に残高減らしておく.
                        // item.available = item.available - 0.005;
                        self.balance.btc = Math.max(item.available, 0);
                        break;
                }
            });
            callback();
        }, function( error ){
            throw Error("APIエラー");
        });
    }

    /**
     * 手数料を更新.
     */
    update_fee ( callback ) {
        var self = this;
        var endpoint = "me/gettradingcommission?product_code=" + this.pair;
        this.__api_request("GET", endpoint, null, function( payload ){
            // console.log( payload );
            self.taker_fee_rate = payload.commission_rate*100;
            callback();
        }, function( error ){
            throw Error("APIエラー");
        });
    }

    /**
     * 現物買い.
     */
    market_buy ( price, amount, success_callback, error_callback ) {
        console.log("buy");
        this.__sellbuy_base("BUY", price, amount, success_callback, error_callback );
    }
    /**
     * 現物売り.
     */
    market_sell ( price, amount, success_callback, error_callback ) {
        console.log("sell");
        this.__sellbuy_base("SELL", price, amount, success_callback, error_callback );
    }
    //sellとbuyの共通部分.
    __sellbuy_base ( side, price, amount, success_callback, error_callback ) {
        var self = this;
        var body = {
            product_code        : self.pair,
            child_order_type    : "LIMIT",
            side                : side,
            price               : price,
            size                : amount,
            minute_to_expire    : 20, // 期限切れまでの時間. 未約定でずっと残るのもアレなので期限を設ける.
            time_in_force       : "GTC", // デフォルトはGTCだけど、多分FOKのほうが合ってる気がする.多分.
        }
        this.__api_request("POST", "me/sendchildorder", body, function( payload ){
            // success.
            var child_order_acceptance_id = payload.child_order_acceptance_id
            var __check = function () {
                // 注文が通ったか確認.
                console.log("bitflyer check order.");
                var body = {
                    product_code    : self.pair,
                    child_order_acceptance_id : child_order_acceptance_id,
                };
                this.__api_request("GET", "me/getchildorders", body, function( payload ){
                    if ( !payload.length ) {
                        console.log("retry..");
                        setTimeout( __check, 3000 );
                    } else {
                        // 通った. 失敗してたり約定しなかったりするだろうけど、balanceは最新になるはず.
                        var order = payload[0];
                        console.log( order.child_order_state );
                        success_callback();
                    }
                });
            }
            __check();
        }, function( error ){
            // error.
            if ( error_callback ) error_callback();
        });
    }

    /**
     * 取引履歴を取得.
     */
    get_trades ( from_date, to_date, callback ) {
        console.log("bitflyerは日時指定でデータ取れないのでスルーします..");
        callback();
    }

    /**
     * 板の変更ストリーム.
     * 板の差分が送られてくるので作りつつ.
     */
    boardStream ( receiver ) {
        var self = this;
        this.__createStreamApi( function( data ){
            var asks = data.message.asks;
            var bids = data.message.bids;
            if ( asks.length ) {
                asks.forEach(function(item) {
                    var price = parseFloat(item.price);
                    var amount = parseFloat(item.size);
                    self.board.asks[price] = amount;
                    if ( amount <= 0 ) { // amountが0の物は板から削除されている.
                        delete self.board.asks[price];
                    }
                });
            }
            if ( bids.length ) {
                bids.forEach(function(item) {
                    var price = parseFloat(item.price);
                    var amount = parseFloat(item.size);
                    self.board.bids[price] = amount;
                    if ( amount <= 0 ) { // amountが0の物は板から削除されている.
                        delete self.board.bids[price];
                    }
                });
            }
            if ( Object.keys(self.board.asks).length && Object.keys(self.board.bids).length ) {
                // お返しします.
                receiver( self );
            }
        } );
    }

    /**
     * bitflyerのストリーミング配信を受け取る.
     * https://lightning.bitflyer.jp/docs?lang=ja
     */
    __createStreamApi (receiver){
        var pair = this.pair;
        var pubnub = new PubNub({
            subscribeKey: 'sub-c-52a9ab50-291b-11e5-baaa-0619f8945a4f'
        });
        pubnub.addListener({
            message: function (data) {
                receiver( data );
            }
        });
        pubnub.subscribe({
            channels: ['lightning_board_' + pair.toUpperCase()]
        });
    }

    /**
     * Bitflyerにリクエスト投げる.
     * ↓見ていい感じに指定して..
     * https://lightning.bitflyer.jp/docs?lang=ja
     */
    __api_request ( method, endpoint, body = {}, success_callback=null, error_callback=null ) {
        // Node.js のサンプル
        var request = require('request');
        var crypto = require('crypto');

        var key = config.apikey;
        var secret = config.apisecret;

        var timestamp = Date.now().toString();

        if ( !method ) {
            method = "POST";
        }

        if ( !body ) body = {};
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
                error_callback( err, response );
                return;
            } else {
                success_callback( JSON.parse(payload), response );
            }
        });
    }
}
module.exports = BitflyerTrader;