"use strict";

var request = require('request');
var fs = require("fs");

/**
 * 取引所のベースとなるクラス.
 */

class Trader {
	constructor ( pair ) {
		this.balance = { jpy:0, btc:0 }; // 使えるお金.
		this.pair = pair;
		this.__positions = []; // { id:999, amount:0.005, side:"sell" }
	}

	unko () {
		console.warn("継承してね");
	}

	/**
	 * 状態を最新にする.
	 */
	update_all ( callback ) {
		console.log("実装されてないよ.  -> " + this.constructor.name + ".update_all()");
		callback();
	}

	/**
	 * 使えるお金を更新.
	 */
	update_balance ( callback ) {
		throw Error("継承してね");
	}

	/**
	 * ポジション一覧を更新.
	 */
	update_positions ( callback ) {
		throw Error("継承してね");
	}



	/**
	 * 売買.
	 */
	buy ( price, amount, success_callback, error_callback ) {
		console.log("実装されてないよ.  -> " + this.constructor.name + ".buy()");
	}
	sell ( price, amount, success_callback, error_callback ) {
		console.log("実装されてないよ.  -> " + this.constructor.name + ".sell()");
	}

	/**
	 * Tikerストリーム.
	 */
	executionsTickerStream ( receiver ) {
		console.log("実装されてないよ.  -> " + this.constructor.name + ".executionsTickerStream()");
	}


	/**
	 * ポジション取得.
	 */
	get_positions ( side = null ) {
		if ( side == null ) return this.__positions;
		var ret = [];
		this.__positions.forEach(function(pos) {
			if ( pos.side.toUpperCase() == side.toUpperCase() ) {
				ret.push( pos );
			}
		});
		return ret;
	}
	get_position ( side ) {
		var positions = this.get_positions();
		return positions[0];
	}
	/**
	 * 平均ポジションを取得.
	 */
	get_avarage_position ( callback ) {
		var self = this;
		self.update_positions(function(){
			/**
			 * 現在のポジションを取得.
			 */
			var ret = {
				side : null,
				amount : 0,
				price : 0,
			};
			var positions = self.get_positions();
			positions.forEach(function( pos ){
				if ( ret.side && ret.side != pos.side ) {
					throw Error("sideがなんかおかしい.");
				}
				ret.side = pos.side;
				ret.amount += parseFloat(pos.amount);
			});
			positions.forEach(function( pos ){
				ret.price += pos.amount/ret.amount * pos.price;
			});
			ret.price = parseInt(ret.price);
			if ( ret.side ) {
				callback( ret );
			} else {
				callback( null );
			}
		});
	}


}
module.exports = Trader;