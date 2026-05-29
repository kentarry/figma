<!DOCTYPE HTML PUBLIC "-//W3C//DTD HTML 4.01//EN" "http://www.w3.org/TR/html4/strict.dtd">
<%@ Page Language="C#" %>
<html>

<head>
	<!-- #include virtual="i_setup.aspx" -->
<%
	g_bCompelSSLEncryptionMode			|= true ;						// [旗標]強制使用加密模式？
	g_bRepairing										|= false ;					// [旗標]維修進行中？

	// ----------------------------------------------------------------------------------------------------------------
	//	本頁面下使用的變數與設定項目
	// ----------------------------------------------------------------------------------------------------------------
	const string			g_strPageName		= "明星商城" ;				// 頁面名稱！

	bool					bDebugMode			= false ;									// 除錯模式

	g_strShareTitle								= "明星商城 - 明星3缺1" ;	// 注意空白規則
	g_strShareContent							= "明星商城" ;

	string					strActionUrl				= Request.FilePath ;
	string					strNewsADAreaID				= GT.GetValue(Request.QueryString["NAI"], "") ;		// 行動連結頁面需帶參數

%>
	<!-- #include virtual="/action/include/i_RwdCSS.aspx" -->
	<!-- #include virtual="/include/i_PageStart.aspx" -->
	<meta http-equiv="Content-Type" content="text/html; charset=utf-8">
	<meta http-equiv="imagetoolbar" content="no">
	<meta name="title" content="<% = g_strShareTitle %>" />
	<meta name="description" content="<% = g_strShareContent %>" />
	<meta property="og:title" content="<% = g_strShareTitle %>" />
	<meta property="og:description" content="<% = g_strShareContent %>" />
	<meta property="og:type" content="article" />
	<meta property="og:url" content="<% = a_csWS.csHomePageColl[" Web"] + Request.Url.AbsolutePath %>" />
	<meta property="og:image" content="<% = a_csWS.csHomePageColl[" Resource_Ssl"]
	+"/Action/ImageResize.aspx?w=200&h=200&url="+ Server.UrlEncode(g_strShareImageUrl) %>" />
	<!-- for IE9 -->
	<meta http-equiv="X-UA-Compatible" content="IE=edge,Chrome=1" />
	<meta http-equiv="X-UA-Compatible" content="IE=9" />
	<title>
	<!-- #include virtual="/include/i_Title.aspx" -->
	</title>
	<link rel="image_src" href="<%= g_strShareImageUrl %>" />
	<!-- 公版 -->
	<link href="/Action/11_Star31/20260527MU/ingame/style/css/master_v2.css?<%=G.COMMON.strCssVersion %>" rel="stylesheet"
	type="text/css" />
	<!-- 美術各自的活動 style -->
	<link href="/Action/11_Star31/20260527MU/ingame/style/css/style.css?v=<% = G.COMMON.strCssVersion %>" rel="stylesheet"
	type="text/css">
	<!-- 外框範圍設定 -->
	<link href="/Action/11_Star31/20260527MU/ingame/style/css/game_view.css?<%=G.COMMON.strCssVersion %>" rel="stylesheet"
	type="text/css">
	<!-- JS -->
	<script type="text/javascript" src="/js/jquery/jquery.min.js?v=<% = G.COMMON.strJsVersion %>"></script>
	<script type="text/javascript" src="/js/JQuery/Plugins/fittext/jquery.fittext.js"></script>
	<script type="text/javascript" src="/js/JQuery/Plugins/loader/loader.min.js?<%=G.COMMON.strJsVersion %>"></script>
	<link href="/js/JQuery/Plugins/loader/style.min.css?<%=G.COMMON.strCssVersion %>" rel="stylesheet">
	<!-- sweetalert -->
	<script type="text/javascript"
	src="/js/JQuery/Plugins/sweetalert/promise.min.js?<%=G.COMMON.strJsVersion %>"></script>
	<script type="text/javascript"
	src="/js/JQuery/Plugins/sweetalert/sweetalert.all.min.js?<%=G.COMMON.strJsVersion %>"></script>
	<script type="text/javascript"
	src="/js/JQuery/Plugins/sweetalert/sweetalert.min.js?<%=G.COMMON.strJsVersion %>"></script>
	<link href="/js/JQuery/Plugins/sweetalert/sweetalert.min.css?<%=G.COMMON.strCssVersion %>" rel="stylesheet"
	type="text/css">
	<!-- swiper -->
	<link href="/js/JQuery/Plugins/swiper/css/swiper-bundle.min.css?v=<% = G.COMMON.strCssVersion %>" rel="stylesheet" type="text/css">
	<script src="/js/JQuery/Plugins/swiper/js/swiper-bundle.min.js?<%=G.COMMON.strJsVersion %>"></script>
	<!-- marquee -->
	<link href="/js/JQuery/Plugins/marquee/jquery.marquee.min.css?v=<% = G.COMMON.strCssVersion %>" rel="stylesheet" type="text/css">
	<script type="text/javascript" src="/js/JQuery/Plugins/marquee/jquery.marquee.min.js?<%=G.COMMON.strJsVersion %>"></script>
</head>

<body style="height: 100%!important;" ondragstart="return false" onselectstart="return false"
	oncontextmenu="return false">
	<div id="ingame__view">
	<script>
		let vh = window.innerHeight * 0.01;
		document.documentElement.style.setProperty('--vh', vh + 'px');
		window.addEventListener('resize', function () {
		let vh = window.innerHeight * 0.01;
		document.documentElement.style.setProperty('--vh', vh + 'px');
		})
	</script>
	<!-- DIV框架 -->
	<div class="ingame__wrapper">
		<div class="ingame__container">
			<div class="gameswitch">
				<!-- 目前active的賽事，會有一個class "gameswitch--active" -->
				<div class="gameswitch--active"	data-index="0"><img src="images/text_team7.png" alt="冠軍決賽"></div>
				<!-- 其他賽事 -->
				<div class="gameswitch__list">
					<div class="switch__item active" data-index="0"><img src="images/text_team7.png" alt="冠軍決賽"></div>
					<div class="switch__item" data-index="1"><img src="images/text_team6.png" alt="季軍賽"></div>
					<div class="switch__item" data-index="2"><img src="images/text_team5.png" alt="準決賽"></div>
					<div class="switch__item" data-index="3"><img src="images/text_team4.png" alt="半準決賽"></div>
					<div class="switch__item" data-index="4"><img src="images/text_team3.png" alt="16強"></div>
					<div class="switch__item" data-index="5"><img src="images/text_team2.png" alt="32強"></div>
					<div class="switch__item" data-index="6"><img src="images/text_team1.png" alt="分組賽"></div>
				</div>
			</div>
			<div class="gameinfo">
				<div class="info__userHave">
					<p class="text">持有</p>
					<img src="images/ticket-1.png" alt="競猜券">
					<p class="num">123,456</p>
				</div>
				<div class="info__countdownTime">
					<p class="value">10天 00時 00分</p>
				</div>
			</div>
			<div class="gameallawards">
				<img src="images/info_award1.png" alt="總獎金">
			</div>
			<div class="gamemain">
				<div class="swiper gamemain-bet" >
					<div class="swiper-wrapper">
						<div class="swiper-slide">
							<div class="betbox">
								<div class="betbox__title">
									<img src="images/text_group_A.png">
								</div>
								<div class="betbox__awards">
									<img src="images/top_award_lv1.png" alt="獎金等級1">
								</div>
								<div class="betbox__nation">
									<ul id="marquee" class="marquee">
										<li><img src="images/betpage/Flag_of_Australia.png"></li>
										<li><img src="images/betpage/Flag_of_Austria.png"></li>
										<li><img src="images/betpage/Flag_of_Belgium.png"></li>
										<li><img src="images/betpage/Flag_of_Bosnia_and_Herzegovina.png"></li>
										<li><img src="images/betpage/Flag_of_Brazil.png"></li>
									</ul>
								</div>
								<div class="betbox__allBetNum">
									<p>1,234,567</p>
								</div>
								<div class="betbox__myBetNum">
									<p>我已投注：123,456</p>
								</div>
								<div class="betbox__BetBtn"></div>
							</div>
						</div>
						<div class="swiper-slide off winbet">
							<div class="betbox">
								<div class="betbox__title">
									<img src="images/text_group_A.png">
								</div>
								<div class="betbox__awards">
									<img src="images/top_award_lv1.png" alt="獎金等級1">
								</div>
								<div class="betbox__nation win">
									<img src="images/betpage/Flag_of_Australia.png">
								</div>
								<div class="betbox__allBetNum">
									<p>1,234,567</p>
								</div>
								<div class="betbox__myBetNum">
									<p>我已投注：123,456</p>
								</div>
								<div class="betbox__BetBtn"></div>
							</div>
						</div>
						<div class="swiper-slide">
							<div class="betbox">
								<div class="betbox__title">
									<img src="images/text_group_B.png">
								</div>
								<div class="betbox__awards">
									<img src="images/top_award_lv2.png" alt="獎金等級1">
								</div>
								<div class="betbox__nation">
									<ul class="nationVs">
										<li><img src="images/Flag_of_Algeria_c.png"></li>
										<li><img src="images/Flag_of_Argentina_c.png"></li>
									</ul>
								</div>
								<div class="betbox__allBetNum">
									<p>1,234,567</p>
								</div>
								<div class="betbox__myBetNum">
									<p>我已投注：123,456</p>
								</div>
								<div class="betbox__BetBtn"></div>
							</div>
						</div>
						<div class="swiper-slide">
							<div class="betbox">
								<div class="betbox__title">
									<img src="images/text_group_C.png">
								</div>
								<div class="betbox__awards">
									<img src="images/top_award_lv3.png" alt="獎金等級1">
								</div>
								<div class="betbox__nation">
									<ul class="nationVs">
										<li><img src="images/Flag_of_Austria_c.png"></li>
										<li><img src="images/Flag_of_Belgium_c.png"></li>
									</ul>
								</div>
								<div class="betbox__allBetNum">
									<p>1,234,567</p>
								</div>
								<div class="betbox__myBetNum">
									<p>我已投注：123,456</p>
								</div>
								<div class="betbox__BetBtn"></div>
							</div>
						</div>
						<div class="swiper-slide off">
							<div class="betbox">
								<div class="betbox__title">
									<img src="images/text_group_D.png">
								</div>
								<div class="betbox__awards">
									<img src="images/top_award_lv4.png" alt="獎金等級1">
								</div>
								<div class="betbox__nation">
									<ul class="nationVs">
										<li class="win"><img src="images/Flag_of_Canada_c.png"></li>
										<li><img src="images/Flag_of_Colombia_c.png"></li>
									</ul>
								</div>
								<div class="betbox__allBetNum">
									<p>1,234,567</p>
								</div>
								<div class="betbox__myBetNum">
									<p>我已投注：123,456</p>
								</div>
								<div class="betbox__BetBtn"></div>
							</div>
						</div>
					</div>
				</div>
				<div class="swiper-button-next"></div>
				<div class="swiper-button-prev"></div>
			</div>
			<div class="gamelight"></div>
			<div class="btn__question"></div><!-- 按鈕-活動說明 -->
			<div class="btn__record"></div><!-- 按鈕-獲獎紀錄 -->
			<!-- 彈跳視窗 -->
			<div class="popup">
				<div class="popup__main popup-base question">
					<a class="btn-close" href="#"></a>
					<h2>大獎經典賽</h2>
					<div class="main">
						<h3>活動時間</h3>
						<div class="part">
							<p>2026/6/11(四)中午12:00～2026/7/29(三)11:59止</p>
						</div>
						<h3>活動內容</h3>
						<div class="part">
							<ol class="list list-asterisk">
								<li>預測這次<span class="f-danger">足球國際賽事</span>各階段賽事結果，猜對就可獲得獎金！</li>
								<li>下注會分為分組賽、32強、16強、半準決賽、準決賽、季軍賽、冠軍賽。</li>
								<li>分組賽要猜哪個國家會是該組的第一名晉級。</li>
								<li>32強、16強、半準決賽、準決賽、季軍賽、冠軍賽則是猜哪一個球隊獲勝。</li>
								<li>可下注的球隊會隨著戰積確定後持續新增至可下注清單內。</li>
								<li>每個階段的獎金都會不同，越靠近決賽預測獎金越高！</li>
								<li>各階段下注開放時間不同，請參照後續表格，留意開放時間。</li>
								<li>開放下注期間每消耗1張下注券，即可投注一次。</li>
								<li>每個階段獲得的下注券無法帶到下一個階段，該階段結束下注時會清除該階段剩餘未下注的下注券，請把握時間下注。</li>
								<li>下注券可透過遊戲內的任務、活動等機制取得。</li>
								<li>各階段結束後，會平分獎金池內的所有獎金給預測成功的下注券玩家。</li>
								<li>獎金請在2026/7/29(三)11:59前領取，開啟此活動介面即可領獎。</li>
							</ol>
						</div>
					</div>
				</div>
				<div class="popup__main popup-base record">
					<a class="btn-close" href="#"></a>
					<h2>我的押注</h2>
					<div class="main">
						<div class="part">
							<table class="table table-full">
								<tr>
									<th>場次</th>
									<th>國家</th>
									<th>我的押注</th>
								</tr>
								<tr>
									<td>預測總冠軍</td>
									<td><img src="images/betpage/bet2_nation-tw.png"></td>
									<td>123,456</td>
								</tr>
							</table>
						</div>
					</div>
				</div>
				<div class="popup__main popup-bet betpage">
					<a class="btn-close" href="#"></a>
					<div class="info__userHave">
						<img src="images/ticket-1.png" alt="競猜券">
						<p class="num">123,456</p>
					</div>
					<div class="betpage__title">
						<div class="title">
							<!-- <img src="images/bet2_title1.png"> -->
							<div class="words">
								<div class="nums">
									<ul>
										<li class="num-6"></li>
										<li class="num-slash"></li>
										<li class="num-5"></li>
									</ul>
								</div>
							</div>
						</div>
						<div class="allawards">
							<p>本場目前總獎金：<span class="f-fun">123,456,789</span></p>
						</div>
					</div>
					<!-- 預測賽事押注畫面 class="betPredict" -->
					<div class="betpage__betbox betPredict">
						<div class="swiper betpage__betbox-bet" >
							<div class="swiper-wrapper">
								<div class="swiper-slide off">
									<div class="betbox">
										<div class="betbox__nation tw">
											<img src="images/betpage/Flag_of_Brazil.png">
										</div>
										<div class="betbox__allBetNum">
											<p>1,234,567</p>
										</div>
										<div class="betbox__myBetNum">
											<p>我已投注：123,456</p>
										</div>
										<div class="betbox__betting">
											<div class="btn btn-reduce"></div>
											<input type="text" value="0" class="betNum">
											<div class="btn btn-add"></div>
										</div>
									</div>
								</div>
								<div class="swiper-slide">
									<div class="betbox">
										<div class="betbox__nation">
											<img src="images/betpage/Flag_of_Canada.png">
										</div>
										<div class="betbox__allBetNum">
											<p>1,234,567</p>
										</div>
										<div class="betbox__myBetNum">
											<p>我已投注：123,456</p>
										</div>
										<div class="betbox__betting">
											<div class="btn btn-reduce"></div>
											<input type="text" value="0" class="betNum">
											<div class="btn btn-add"></div>
										</div>
									</div>
								</div>
								<div class="swiper-slide">
									<div class="betbox">
										<div class="betbox__nation">
											<img src="images/betpage/Flag_of_New_Zealand.png">
										</div>
										<div class="betbox__allBetNum">
											<p>1,234,567</p>
										</div>
										<div class="betbox__myBetNum">
											<p>我已投注：123,456</p>
										</div>
										<div class="betbox__betting">
											<div class="btn btn-reduce"></div>
											<input type="text" value="0" class="betNum">
											<div class="btn btn-add"></div>
										</div>
									</div>
								</div>
								<div class="swiper-slide">
									<div class="betbox">
										<div class="betbox__nation">
											<img src="images/betpage/Flag_of_South_Africa.png">
										</div>
										<div class="betbox__allBetNum">
											<p>1,234,567</p>
										</div>
										<div class="betbox__myBetNum">
											<p>我已投注：123,456</p>
										</div>
										<div class="betbox__betting">
											<div class="btn btn-reduce"></div>
											<input type="text" value="0" class="betNum">
											<div class="btn btn-add"></div>
										</div>
									</div>
								</div>
							</div>
						</div>
						<div class="swiper-button-next"></div>
						<div class="swiper-button-prev"></div>
					</div>
					<!-- 對戰賽事押注畫面 class="betGame" -->
					<div class="betpage__betbox betGame" style="display:none;">
						<div class="swiper betpage__betbox-bet" >
							<div class="swiper-wrapper">
								<div class="swiper-slide swiper-slide-active">
									<div class="betbox">
										<div class="betbox__nation tw">
											<img src="images/betpage/Flag_of_Brazil.png">
										</div>
										<div class="betbox__allBetNum">
											<p>1,234,567</p>
										</div>
										<div class="betbox__myBetNum">
											<p>我已投注：123,456</p>
										</div>
										<div class="betbox__betting">
											<div class="btn btn-reduce off"></div>
											<input type="text" value="0" class="betNum">
											<div class="btn btn-add"></div>
										</div>
									</div>
								</div>
								<div class="swiper-slide">
									<div class="betbox">
										<div class="betbox__nation">
											<img src="images/betpage/Flag_of_Canada.png">
										</div>
										<div class="betbox__allBetNum">
											<p>1,234,567</p>
										</div>
										<div class="betbox__myBetNum">
											<p>我已投注：123,456</p>
										</div>
										<div class="betbox__betting">
											<div class="btn btn-reduce"></div>
											<input type="text" value="0" class="betNum">
											<div class="btn btn-add"></div>
										</div>
									</div>
								</div>
							</div>
						</div>
					</div>
					<div class="betpage__note">
						請輸入要投注的數量
					</div>
					<div class="betpage__betBtns">
						<div class="btn_bet btn_betClear"></div>
						<div class="btn_bet btn_betSure"></div>
					</div>
				</div>
			</div>
		</div>
		<div class="ingame__popup--bg"></div>
	</div>
	<!-- JS -->
	<script language="javascript">
		//跑馬燈
		$(document).ready(function (){
			$(".marquee").marquee({
				xScroll: "left",
				showSpeed: 200,
				pauseSpeed: 1000,
				pauseOnHover: false
			});
		});
		var swiper = new Swiper(".gamemain-bet", {
			autoplay:false,
			allowTouchMove:true,
			slidesPerView: 3,
			spaceBetween: "0",
			centeredSlides: true,
			slideToClickedSlide: true,
			loop:true,
			navigation: {
				nextEl: ".swiper-button-next",
				prevEl: ".swiper-button-prev",
			}
		});

		var swiper = new Swiper(".betPredict .betpage__betbox-bet", {
			autoplay:false,
			allowTouchMove:true,
			slidesPerView: 3,
			spaceBetween: "0",
			centeredSlides: true,
			slideToClickedSlide: true,
			loop:true,
			navigation: {
				nextEl: ".swiper-button-next",
				prevEl: ".swiper-button-prev",
			},
		});
	//*--------------------------
		//詳細說明區相關
		function question() {
			$('.popup, .ingame__popup--bg, .question').addClass("show");
			//關閉
			$(".btn-close").on("click", btn_x);
		}
		//獲獎紀錄
		function record() {
			$('.popup, .ingame__popup--bg, .record').addClass("show");
			//關閉
			$(".btn-close").on("click", btn_x);
		}
		//投注內頁
		function betpage() {
			$('.popup, .ingame__popup--bg, .betpage').addClass("show");
			//關閉
			$(".btn-close").on("click", btn_x);
		}
		// gameswitch 切換賽事 select game
		$(".gameswitch").on("click", function () {
			$('.gameswitch__list, .gameswitch').toggleClass("show");
			$(".switch__item").on("click", function () {
				var index = $(this).data("index");
				$(".gameswitch--active").attr("data-index", index).find("img").attr("src", $(this).find("img").attr("src"));
				$(this).addClass("active").siblings().removeClass("active");
			});
		});

		//關閉
		function btn_x() {
			$('.popup, .ingame__popup--bg, .popup__main').removeClass("show");
		}
		//場景點擊
		$(".btn__question").on("click", question);
		$(".btn__record").on("click", record);
		$(".btn-close").on("click", btn_x);
		$(".betbox__BetBtn").on("click", betpage);
		$(".betGame .swiper-slide").on("click", function () {
			$(".betGame .swiper-slide").removeClass("swiper-slide-active");
			$(this).addClass("swiper-slide-active");
		});
		$(".betpage .btn_betSure").on("click", betpageFin);
	</script>
</div>
</body>
</html>
<!-- #include virtual="/include/i_PageEnd.aspx" -->