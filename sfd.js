"use strict";

var BitflyerfxTrader = require("./lib/bitflyerfx_trader");
var fxbtc_trader = new BitflyerfxTrader("FX_BTC_JPY");
var btc_trader = new BitflyerfxTrader("BTC_JPY");


/**
* 売買する数の設定.
* configファイルで設定したほうがオシャレだと思う.
*/
var AMOUNT = 0.01;       // 1度の売買で出す板.
var POSMAX = AMOUNT * 3; // 最大ポジション.
var TARGET_RATE = 5;     // 現物乖離何％の箇所に板置くか.


/**
 * リアルタイムAPIで価格を取得.
 * 最適な価格を計算して板を出す.
 */
var buy_ok = false;  // 買い入れておっけー
var sell_ok = false; // 売り入れておっけー
fxbtc_trader.update_all(function(){
	console.log(fxbtc_trader.balance);
	/** 
	 * Tickerストリームを受信して
	 * 最終取引価格を取得.
	*/
	var btc_last_price = 0;
	btc_trader.executionsTickerStream(function( data ){
		btc_last_price = parseInt(data.message.ltp); // 現物最終取引価格.
		_check_and_trade();
	});
	var fx_last_price = 0;
	fxbtc_trader.executionsTickerStream(function( data ){
		// 4.9999％になる価格と5％になる価格を取りたい.
		// 乖離が5%になる価格が取れればOKなはず.
		fx_last_price = parseInt(data.message.ltp);
		_check_and_trade();
	});
	
	/**
	* 最適な価格に板を出す.
	*/
	var last_best_price = 0;
	var _check_and_trade = function () {
		var rate = 1 + TARGET_RATE/100;
		var best_price = Math.ceil(btc_last_price * rate);
		process.stdout.write( TARGET_RATE+"% : " + best_price + "\r" );
		if ( last_best_price != best_price ) {
			// 最適価格が変わってる.
			// キャンセルできた、買えたかどうかとか確認してる暇無いので確認は無しで.
			fxbtc_trader.clear_active_orders();
			if ( sell_ok ) {
				fxbtc_trader.sell(best_price, AMOUNT);
			}
			if ( buy_ok ) {
				fxbtc_trader.buy((best_price-10), AMOUNT);
			}
			console.log("売買 : " + best_price);
			// exec("afplay /System/Library/Sounds/Glass.aiff");
		}
		last_best_price = best_price;
	};
});


/**
 * 定期的にポジションの数見て売買しておっけーか判定.
 */
var reflex = function () {
	fxbtc_trader.get_avarage_position(function( position ){
		if ( !position ) {
			buy_ok = true;
			sell_ok = true;
			// console.log("ノーポジ");
		}
		if ( position && position.amount < POSMAX ) {
			buy_ok = true;
			sell_ok = true;
			// console.log("物足りない. amount=" + position.amount);
		}
		if ( position && POSMAX <= position.amount && position.side == "BUY" ) {
			buy_ok = false;
			sell_ok = true;
			// console.log("BUY制限. amount=" + position.amount);
		}
		if ( position && POSMAX <= position.amount && position.side == "SELL" ) {
			buy_ok = true;
			sell_ok = false;
			// console.log("SELL制限. amount=" + position.amount);
		}
		setTimeout( reflex, 5000 );
	});
}
reflex();

