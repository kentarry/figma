<%--------------------------------------------------------------------------------------------------------------------
--------------------------------------------------------------------------------------------------------------------%>
<!DOCTYPE HTML PUBLIC "-//W3C//DTD HTML 4.01//EN" "http://www.w3.org/TR/html4/strict.dtd">
<%@ Page Language="C#" %>
<%@ Import Namespace = "Newtonsoft.Json" %>
<%@ Import Namespace = "Newtonsoft.Json.Linq" %>
<html>
<head>
<!-- #include virtual="i_setup.aspx" -->
<%
	g_bCompelSSLEncryptionMode			|= true ;						// [旗標]強制使用加密模式？
	g_bRepairing										|= false ;					// [旗標]維修進行中？

	// ----------------------------------------------------------------------------------------------------------------
	//	本頁面下使用的變數與設定項目
	// ----------------------------------------------------------------------------------------------------------------
	const string			g_strPageName		= strActionName ;				// 頁面名稱

	bool					bDebugMode			= false ;									// 除錯模式

	g_strShareTitle								= strActionName + " - 明星3缺1" ;	// 注意空白規則
	g_strShareContent							= strActionName ;

	string					strActionUrl				= Request.FilePath ;
	string					strNewsADAreaID				= GT.GetValue(Request.QueryString["NAI"], "") ;
	int						nWin						= 0 ;		// 此活動固定 0（WIN_AMOUNT 由排程計算）
	int						nWinAmount					= 0 ;		// 玩家未領總獎金
	bool					bIsGet						= false ;	// 是否已全部領取

	string					strIniAlertMsg				= string.Empty ;
	string					strDemoKey					= string.Empty ;
	Dictionary<int, GT_TicketData>	csTicketDataColl	= new Dictionary<int, GT_TicketData>() ;

	// 賽事資料（供前端渲染使用）
	Dictionary<string, List<GT_MatchData.TeamInfo>>		csGroupTeams		= new Dictionary<string, List<GT_MatchData.TeamInfo>>() ;
	Dictionary<string, List<GT_MatchData>>				csMatchesByStage	= new Dictionary<string, List<GT_MatchData>>() ;
	Dictionary<string, int>								csGroupWinners		= new Dictionary<string, int>() ;		// 分組賽各組第一名 TEAM_ID

	if (G.COMMON.bIsDemo)
	{
		strDemoKey = (Guid.NewGuid()).ToString() ;
	}
%>
<!-- #include virtual="/action/include/i_RwdCSS.aspx" -->
<!-- #include virtual="/include/i_PageStart.aspx" -->
<!-- #include virtual="i_ActionSetup.aspx" -->
<%
	if (strLocation.Equals("TW", StringComparison.OrdinalIgnoreCase))
		bOverseasIP = false ;

	if (g.csWU.bMemberLogined || G.COMMON.bIsDemo)
	{
		if (!GetActionItemCount(g.csWU, g.dtNow, out nItemAmount, out bHasPlayGame))
		{
			strIniAlertMsg = "伺服器忙碌中，請稍後再試。(1)" ;
		}
		else if (!GetTicketTable(g.csWU.nMemberNo, g.dtNow, out csTicketDataColl))
		{
			strIniAlertMsg = "伺服器忙碌中，請稍後再試。(2)" ;
		}
		else if (!GetWinPoint(g.dtNow, out nWin))
		{
			strIniAlertMsg = "伺服器忙碌中，請稍後再試。(3)" ;
		}
		else if (!GetWinAmount(g.csWU.nMemberNo, g.dtNow, nWin, false, out nWinAmount, out bIsGet))
		{
			strIniAlertMsg = "伺服器忙碌中，請稍後再試。(4)" ;
		}
		else
		{
			// 載入分組賽各組隊伍
			GetGroupTeams(out csGroupTeams) ;

			// 載入分組賽各組第一名隊伍
			GetGroupStageWinners(out csGroupWinners) ;

			// 載入各淘汰賽階段比賽列表（只取玩家有下注或當前開放的階段）
			foreach (GT_StageInfo csStage in csStageList)
			{
				if (!csStage.bIsGroupStage)
				{
					List<GT_MatchData> csList = null ;
					if (GetMatchList(csStage.strStageKey, out csList) && csList.Count > 0)
						csMatchesByStage[csStage.strStageKey] = csList ;
				}
			}
		}
	}

	// 判斷玩家是否有未領獎（大廳小紅點）
	bool bHasUnclaimedPrize = !bIsGet && nWinAmount > 0 ;
	// 判斷玩家是否有下注券（大廳小紅點）
	bool bHasTicket = nItemAmount > 0 && csCurrentStage != null ;

	// ── 建立傳給前端的賽事 JSON ──
	System.Text.StringBuilder sbSD = new System.Text.StringBuilder() ;
	sbSD.Append("[") ;
	bool bFSt = true ;
	// 反向迭代：最新階段(FINAL)先輸出，分組賽最後（gameswitch 由新到舊）
	for (int si = csStageList.Count - 1; si >= 0; si--)
	{
		GT_StageInfo cs	= csStageList[si] ;
		bool bVis		= cs.dtBetStart <= g.dtNow ;
		int  nImg		= 7 - cs.nSortOrder ;		// 分組賽=1 … 冠軍決賽=7

		if (!bFSt) sbSD.Append(",") ;
		bFSt = false ;

		sbSD.AppendFormat("{{\"stageKey\":\"{0}\",\"stageName\":\"{1}\",\"imageNum\":{2},\"isVisible\":{3},\"isActiveBet\":{4},\"isGroupStage\":{5},\"prizeAmount\":{6},\"betStartDate\":\"{7}\",\"betEndDate\":\"{8}\",\"betEndDateISO\":\"{9}\",\"items\":[",
			cs.strStageKey, cs.strStageName, nImg,
			bVis ? "true" : "false",
			(csCurrentStage != null && csCurrentStage.strStageKey == cs.strStageKey) ? "true" : "false",
			cs.bIsGroupStage ? "true" : "false",
			cs.lPrizeAmount,
			cs.dtBetStart.ToString("M月d日"),
			cs.dtBetEnd.ToString("M月d日"),
			cs.dtBetEnd.ToString("yyyy-MM-dd HH:mm:ss")) ;

		bool bFIt = true ;

		if (cs.bIsGroupStage)
		{
			string[] aGrp = {"GROUP_A","GROUP_B","GROUP_C","GROUP_D","GROUP_E","GROUP_F","GROUP_G","GROUP_H","GROUP_I","GROUP_J","GROUP_K","GROUP_L"} ;
			foreach (string gk in aGrp)
			{
				if (!csGroupOrdinalMap.ContainsKey(gk)) continue ;
				int		nGo	= csGroupOrdinalMap[gk] ;
				string	gl	= gk.Replace("GROUP_","") ;
				var		rgt	= csGroupTeams.ContainsKey(gk) ? csGroupTeams[gk] : new System.Collections.Generic.List<GT_MatchData.TeamInfo>() ;

				if (!bFIt) sbSD.Append(",") ;
				bFIt = false ;

				int nGT = 0, nGM = 0 ;
				int nGroupWinnerTeamId = csGroupWinners.ContainsKey(gk) ? csGroupWinners[gk] : -1 ;
				System.Text.StringBuilder sbTeams = new System.Text.StringBuilder() ;
				bool bFTm = true ;
				foreach (GT_MatchData.TeamInfo tm in rgt)
				{
					int mc = nGo * 10000 + tm.nTeamId ;
					int tt = csTicketDataColl.ContainsKey(mc) ? csTicketDataColl[mc].nTotalCount : 0 ;
					int tm2= csTicketDataColl.ContainsKey(mc) ? csTicketDataColl[mc].nPersonalCount : 0 ;
					bool bIsWinner = (nGroupWinnerTeamId > 0 && tm.nTeamId == nGroupWinnerTeamId) ;
					nGT += tt ; nGM += tm2 ;
					if (!bFTm) sbTeams.Append(",") ;
					bFTm = false ;
					sbTeams.AppendFormat("{{\"teamId\":{0},\"teamName\":\"{1}\",\"teamIcon\":\"{2}\",\"medalCount\":{3},\"totalBets\":{4},\"myBets\":{5},\"isWinner\":{6}}}",
						tm.nTeamId,
						tm.strName.Replace("\\","\\\\").Replace("\"","\\\""),
						tm.strIcon.Replace("\\","\\\\").Replace("\"","\\\""),
						mc, tt, tm2,
						bIsWinner ? "true" : "false") ;
				}
				sbSD.AppendFormat("{{\"groupKey\":\"{0}\",\"groupName\":\"{1}組\",\"groupOrdinal\":{2},\"totalBets\":{3},\"myBets\":{4},\"winnerTeamId\":{5},\"teams\":[{6}]}}",
					gk, gl, nGo, nGT, nGM, nGroupWinnerTeamId, sbTeams) ;
			}
		}
		else
		{
			var rm = csMatchesByStage.ContainsKey(cs.strStageKey) ? csMatchesByStage[cs.strStageKey] : new System.Collections.Generic.List<GT_MatchData>() ;
			foreach (GT_MatchData m in rm)
			{
				int hm = m.nIndexNo * 10000 + (m.nHomeTeamId > 0 ? m.nHomeTeamId : 0) ;
				int am = m.nIndexNo * 10000 + (m.nAwayTeamId > 0 ? m.nAwayTeamId : 0) ;
				int ht = (m.nHomeTeamId>0 && csTicketDataColl.ContainsKey(hm)) ? csTicketDataColl[hm].nTotalCount : 0 ;
				int hmy= (m.nHomeTeamId>0 && csTicketDataColl.ContainsKey(hm)) ? csTicketDataColl[hm].nPersonalCount : 0 ;
				int at = (m.nAwayTeamId>0 && csTicketDataColl.ContainsKey(am)) ? csTicketDataColl[am].nTotalCount : 0 ;
				int amy= (m.nAwayTeamId>0 && csTicketDataColl.ContainsKey(am)) ? csTicketDataColl[am].nPersonalCount : 0 ;

				if (!bFIt) sbSD.Append(",") ;
				bFIt = false ;

				string htJson = m.nHomeTeamId > 0
					? string.Format("{{\"teamId\":{0},\"teamName\":\"{1}\",\"teamIcon\":\"{2}\",\"medalCount\":{3},\"totalBets\":{4},\"myBets\":{5}}}",
						m.nHomeTeamId, m.strHomeTeamName.Replace("\\","\\\\").Replace("\"","\\\""), m.strHomeTeamIcon.Replace("\\","\\\\").Replace("\"","\\\""), hm, ht, hmy)
					: "null" ;
				string atJson = m.nAwayTeamId > 0
					? string.Format("{{\"teamId\":{0},\"teamName\":\"{1}\",\"teamIcon\":\"{2}\",\"medalCount\":{3},\"totalBets\":{4},\"myBets\":{5}}}",
						m.nAwayTeamId, m.strAwayTeamName.Replace("\\","\\\\").Replace("\"","\\\""), m.strAwayTeamIcon.Replace("\\","\\\\").Replace("\"","\\\""), am, at, amy)
					: "null" ;

				sbSD.AppendFormat("{{\"matchIndexNo\":{0},\"winnerTeamId\":{1},\"totalBets\":{2},\"myBets\":{3},\"homeTeam\":{4},\"awayTeam\":{5}}}",
					m.nIndexNo, m.nWinnerTeamId, ht + at, hmy + amy, htJson, atJson) ;
			}
		}
		sbSD.Append("]}") ;
	}
	sbSD.Append("]") ;
	string strAllStagesJson = sbSD.ToString() ;
%>
<meta http-equiv="Content-Type" content="text/html; charset=utf-8">
<meta http-equiv="imagetoolbar" content="no">
<meta name="title" content="<% = g_strShareTitle %>" />
<meta name="description" content="<% = g_strShareContent %>" />
<meta property="og:title" content="<% = g_strShareTitle %>" />
<meta property="og:description" content="<% = g_strShareContent %>" />
<meta property="og:type" content="article" />
<meta property="og:url" content="<% = a_csWS.csHomePageColl["Web"] + Request.Url.AbsolutePath %>" />
<meta property="og:image"
		content="<% = a_csWS.csHomePageColl["Resource_Ssl"] +"/Action/ImageResize.aspx?w=200&h=200&url="+ Server.UrlEncode(g_strShareImageUrl) %>" />
<!-- for IE9 -->
<meta http-equiv="X-UA-Compatible" content="IE=edge,Chrome=1" />
<meta http-equiv="X-UA-Compatible" content="IE=9" />
<title>
<!-- #include virtual="/include/i_Title.aspx" -->
</title>
<link rel="image_src" href="<%= g_strShareImageUrl %>" />
<!-- JS -->
<script type="text/javascript" src="/js/jquery/jquery.min.js?v=<% = G.COMMON.strJsVersion %>"></script>
<script type="text/javascript" src="/js/JQuery/Plugins/fittext/jquery.fittext.js"></script>
<script type="text/javascript" src="/js/JQuery/Plugins/loader/loader.min.js?<%=G.COMMON.strJsVersion %>"></script>
<link href="/js/JQuery/Plugins/loader/style.min.css?<%=G.COMMON.strCssVersion %>" rel="stylesheet">
<script type="text/javascript" src="/js/JQuery/Plugins/countdown/jquery.countdown.min.js?<%=G.COMMON.strJsVersion %>"></script>
<!-- sweetalert -->
<script type="text/javascript" src="/js/JQuery/Plugins/sweetalert/promise.min.js?<%=G.COMMON.strJsVersion %>"></script>
<script type="text/javascript" src="/js/JQuery/Plugins/sweetalert/sweetalert.all.min.js?<%=G.COMMON.strJsVersion %>"></script>
<script type="text/javascript" src="/js/JQuery/Plugins/sweetalert/sweetalert.min.js?<%=G.COMMON.strJsVersion %>"></script>
<link href="/js/JQuery/Plugins/sweetalert/sweetalert.min.css?<%=G.COMMON.strCssVersion %>" rel="stylesheet" type="text/css">
<!-- swiper -->
<link href="/js/JQuery/Plugins/swiper/css/swiper-bundle.min.css?v=<% = G.COMMON.strCssVersion %>" rel="stylesheet" type="text/css">
<script src="/js/JQuery/Plugins/swiper/js/swiper-bundle.min.js?<%=G.COMMON.strJsVersion %>"></script>

<!-- 公版 -->
<link href="/Action/11_Star31/20260527MU/ingame/style/css/master_v2.css?<%=G.COMMON.strCssVersion %>" rel="stylesheet" type="text/css" />
<!-- 美術各自的活動 style -->
<link href="/Action/11_Star31/20260527MU/ingame/style/css/style.css?v=<% = G.COMMON.strCssVersion %>" rel="stylesheet"	type="text/css">
<!-- 外框範圍設定 -->
<link href="/Action/11_Star31/20260527MU/ingame/style/css/game_view.css?<%=G.COMMON.strCssVersion %>" rel="stylesheet" type="text/css">
<!-- marquee -->
<link href="/js/JQuery/Plugins/marquee/jquery.marquee.min.css?v=<% = G.COMMON.strCssVersion %>" rel="stylesheet" type="text/css">
<script type="text/javascript" src="/js/JQuery/Plugins/marquee/jquery.marquee.min.js?<%=G.COMMON.strJsVersion %>"></script>
<!-- Fix sweetalert warning icon double display -->
<style>
	.swal2-icon.swal2-warning::before {
		content: "" !important;
	}
</style>
</head>

<body style="height: 100%!important;" ondragstart="return false" onselectstart="return false" oncontextmenu="return false">
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
					<!-- 目前 active 的賽事 -->
					<div class="gameswitch--active" data-stage="" id="gsSwitchActive">
						<img src="" alt=""></div>
					<!-- 賽事列表：由 JS 填入已開放的階段 -->
					<div class="gameswitch__list" id="gsSwitchList"></div>
				</div>
				<div class="gameinfo">
					<div class="info__userHave">
						<p class="text">持有</p>
						<img src="images/ticket-1.png" alt="競猜券" id="ticketImg">
						<p class="num" id="itemAmountDisplay"><%= string.Format("{0:N0}", nItemAmount) %></p>
					</div>
					<div class="info__countdownTime">
						<p class="value" id="countdownDisplay">-- -- --</p>
					</div>
				</div>
				<div class="game__banner"><p>國際足球賽事預測成功拿獎金</p></div>
			<div class="gameallawards">
					<img src="images/info_award1.png" alt="總獎金" id="awardImage">
				</div>
				<div class="gamemain">
					<div class="swiper gamemain-bet">
						<!-- 由 JS 依選中階段填入 -->
						<div class="swiper-wrapper" id="mainBetWrapper"></div>
					</div>
					<div class="swiper-button-next" id="mainBetNext"></div>
					<div class="swiper-button-prev" id="mainBetPrev"></div>
				</div>
				<div class="btn__question"></div>
				<div class="btn__record"></div>
				<!-- 按鈕-活動說明 -->
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
								<table class="table table-full" id="recordTable">
									<thead>
										<tr>
										<th>場次</th>
										<th>隊伍</th>
										<th>我的押注</th>
										<th>結果</th>
									</tr>
									</thead>
									<tbody id="recordTableBody">
										<!-- 由 JS 依押注紀錄填入 -->
									</tbody>
								</table>
							</div>
						</div>
					</div>
					<div class="popup__main popup-bet betpage">
						<a class="btn-close" href="#"></a>
						<div class="info__userHave">
							<img src="images/ticket-1.png" alt="競猜券">
							<p class="num" id="betPageItemCount"><%= string.Format("{0:N0}", nItemAmount) %></p>
						</div>
						<div class="betpage__title">
							<div class="title">
								<div class="words" id="betPageTitleWords"></div>
							</div>
							<div class="allawards">
								<p>本場目前總獎金：<span class="f-fun" id="betPagePrize">0</span></p>
							</div>
						</div>
						<!-- 分組賽押注：多隊 swiper，含導覽箭頭 -->
						<div class="betpage__betbox betPredict" id="betPredictBox" style="display:none;">
							<div class="swiper betpage__betbox-bet">
								<div class="swiper-wrapper" id="betPredictWrapper"></div>
							</div>
							<div class="swiper-button-next"></div>
							<div class="swiper-button-prev"></div>
						</div>
						<!-- 淘汰賽押注：兩隊並列，點擊切換，無箭頭 -->
						<div class="betpage__betbox betGame" id="betGameBox" style="display:none;">
							<div class="swiper betpage__betbox-bet">
								<div class="swiper-wrapper" id="betGameWrapper"></div>
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
		<!-- Loading -->
		<div class="loading_wrp" style="display:none;">
			<div class="loading"><div class="spinner"></div></div>
			<p id="loadingWord">處理中...請稍候</p>
		</div>
		<!-- JS -->
		<script type="text/javascript">
			// ── 伺服器注入資料 ──
			var g_nItemAmount        = <%= nItemAmount %>;
			var g_nWinAmount         = <%= nWinAmount %>;
			var g_bHasUnclaimedPrize = <%= bHasUnclaimedPrize ? "true" : "false" %>;
			var g_bHasTicket         = <%= bHasTicket ? "true" : "false" %>;
			var g_strCurrentStage    = "<%= csCurrentStage != null ? csCurrentStage.strStageKey : "" %>";
			// 所有賽事階段資料（newest→oldest）
			var g_csAllStages = <%= strAllStagesJson %>;
			// 當前開放投注階段的結束時間
			var g_dtCurrentStageBetEnd = <%= csCurrentStage != null ? "new Date('" + csCurrentStage.dtBetEnd.ToString("yyyy-MM-dd HH:mm:ss") + "')" : "null" %>;
			// 當前伺服器時間（用於測試環境時間判斷）
			var g_dtNow = new Date('<%= g.dtNow.ToString("yyyy-MM-dd HH:mm:ss") %>');
			var g_bIsTestWebsite = <%= a_csWS.bIsTestWebsite ? "true" : "false" %>;

			// ── 狀態 ──
			var g_selectedStageKey = "";
			var g_mainBetSwiper    = null;
			var g_betPredSwiper    = null;
			var g_bIsExchanging    = false;

			// ── 工具函數 ──
			function fmtNum(n) {
				if (!n) return "0";
				return n.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ",");
			}
			function getStageData(key) {
				for (var i = 0; i < g_csAllStages.length; i++) {
					if (g_csAllStages[i].stageKey === key) return g_csAllStages[i];
				}
				return null;
			}
			// 顯示訊息
			function AlertMessage(_strContent, _options) {
				_options = _options || {};
				var config = {
					confirmButtonText: "關閉",
					showCloseButton: false
				};

				// 如果 _options 中有 title，則使用 title + text 分離模式
				if (_options.title) {
					config.title = _options.title;
					config.text = _strContent;
					delete _options.title;
				} else {
					// 否則使用 html 模式
					config.html = _strContent;
				}

				swal.fire(Object.assign(config, _options));
			};

			// 從日期字串中提取日份數字（例如 "6月15日" -> "15"）
			function extractDayNumbers(dateStr) {
				if (!dateStr) return "";
				var match = dateStr.match(/(\d+)日/);
				return match ? match[1] : "";
			}

			// 檢查投注是否已結束
			function isBetEnded(betEndDateISO) {
				if (!betEndDateISO) return false;
				var endDate = new Date(betEndDateISO);
				// 測試環境使用伺服器時間，否則使用客戶端時間
				var now = g_bIsTestWebsite ? g_dtNow : new Date();
				return now >= endDate;
			}

			// ── 渲染 gameswitch 列表 ──
			function renderGameSwitch(activeStageKey) {
				var html = "", activeStage = null;
				for (var i = 0; i < g_csAllStages.length; i++) {
					var s = g_csAllStages[i];
					if (!s.isVisible) continue;
					var isAct = s.stageKey === activeStageKey;
					if (isAct) activeStage = s;
					html += '<div class="switch__item' + (isAct ? " active" : "") + '" data-stage="' + s.stageKey + '">' +
						'<img src="images/text_team' + s.imageNum + '.png" alt="' + s.stageName + '"></div>';
				}
				$("#gsSwitchList").html(html);
				if (activeStage) {
					$("#gsSwitchActive").attr("data-stage", activeStage.stageKey).find("img")
						.attr("src", "images/text_team" + activeStage.imageNum + ".png").attr("alt", activeStage.stageName);
				}
				g_selectedStageKey = activeStageKey;
				$("#gsSwitchList .switch__item").on("click", function () {
					var key = $(this).data("stage");
					renderGameSwitch(key);
					renderMainBet(key);
					$(".gameswitch__list, .gameswitch").removeClass("show");
				});
			}

			// ── 渲染 gamemain-bet swiper ──
			function renderMainBet(stageKey) {
				var stage = getStageData(stageKey);
				if (g_mainBetSwiper) { try { g_mainBetSwiper.destroy(true, true); } catch(e){} g_mainBetSwiper = null; }
				var html = "";
				if (!stage || stage.items.length === 0) {
					html = '<div class="swiper-slide"><div class="betbox betbox--empty"><p>尚無可投注的場次</p></div></div>';
				} else {
					for (var i = 0; i < stage.items.length; i++) {
						var item = stage.items[i];
						html += buildMainBetSlide(stage, item, i);
					}
				}
				$("#mainBetWrapper").html(html);

				// 動態切換獎金看板圖
				if (stage) {
					$("#awardImage").attr("src", "images/info_award" + stage.imageNum + ".png");
				}

				// 投注已結束的 slide 添加 off 類
				if (stage && isBetEnded(stage.betEndDateISO)) {
					$("#mainBetWrapper .swiper-slide").addClass("off");
				}

				// 只對尚未知勝者的分組賽 slide 啟動跑馬燈（有 has-winner 的跳過）
				if (stage && stage.isGroupStage) {
					$("#mainBetWrapper .swiper-slide").each(function() {
						var $marquee = $(this).find(".marquee:not(.has-winner)");
						if ($marquee.length) {
							$marquee.marquee({ xScroll:"left", showSpeed:200, pauseSpeed:1000, pauseOnHover:false });
						}
					});
				}
				g_mainBetSwiper = new Swiper(".gamemain-bet", {
					autoplay:false, allowTouchMove:true, slidesPerView:3, spaceBetween:0,
					centeredSlides:true, loop: stage && stage.items.length >= 3,
					navigation: { nextEl:"#mainBetNext", prevEl:"#mainBetPrev" }
				});
				$("#mainBetWrapper .betbox__BetBtn").on("click", function () {
					openBetPage(stageKey, parseInt($(this).attr("data-item-idx")));
				});
			}

			function buildMainBetSlide(stage, item, idx) {
				var html = '<div class="swiper-slide"><div class="betbox">';
				if (stage.isGroupStage) {
					var gl = item.groupKey.replace("GROUP_","");
					var hasWinner = item.winnerTeamId > 0;
					html += '<div class="betbox__title"><img src="images/text_group_' + gl + '.png" alt="' + item.groupName + '"></div>';
					html += '<div class="betbox__awards"><img src="images/top_award_lv1.png" alt="獎金"></div>';

					// 有無勝者都加上 marquee class 保持排版一致，已知勝者則不初始化跑馬燈插件
					html += '<div class="betbox__nation"><ul class="marquee' + (hasWinner ? ' has-winner' : '') + '" style="overflow:hidden;">';
					for (var j = 0; j < item.teams.length; j++) {
						var t = item.teams[j];
						html += '<li' + (t.isWinner ? ' class="win" style="overflow:hidden;top:0px;left:0px;"' : ' style="overflow:hidden;"') + '>' +
							(t.teamIcon ? '<img src="'+t.teamIcon+'" title="'+t.teamName+'" style="max-height:100%;object-fit:contain;">' : t.teamName) +
							'</li>';
					}
					html += '</ul></div>';
				} else {
					var home = item.homeTeam, away = item.awayTeam, wid = item.winnerTeamId;
					html += '<div class="betbox__nation"><ul class="nationVs">';
					html += '<li' + (home && wid === home.teamId ? ' class="win"':'') + '>' +
						(home ? (home.teamIcon ? '<img src="'+home.teamIcon+'" title="'+home.teamName+'">' : home.teamName) : '待定') + '</li>';
					html += '<li' + (away && wid === away.teamId ? ' class="win"':'') + '>' +
						(away ? (away.teamIcon ? '<img src="'+away.teamIcon+'" title="'+away.teamName+'">' : away.teamName) : '待定') + '</li>';
					html += '</ul></div>';
				}
				html += '<div class="betbox__allBetNum"><p>' + fmtNum(item.totalBets) + '</p></div>';
				html += '<div class="betbox__myBetNum"><p>我已投注：' + fmtNum(item.myBets) + '</p></div>';
				// 分組賽始終顯示投注按鈕（已結束會禁用），淘汰賽只在未結束時顯示
				if (stage.isGroupStage || !isBetEnded(stage.betEndDateISO)) {
					html += '<div class="betbox__BetBtn" data-item-idx="' + idx + '"></div>';
				}
				return html + '</div></div>';
			}

			// ── 開啟 betpage popup ──
			function openBetPage(stageKey, itemIdx) {
				var stage = getStageData(stageKey);
				if (!stage || !stage.items[itemIdx]) return;
				var item    = stage.items[itemIdx];
				var isGroup = stage.isGroupStage;

				// 銷毀舊 Swiper
				if (g_betPredSwiper) { try { g_betPredSwiper.destroy(true,true); } catch(e){} g_betPredSwiper = null; }

				// 填入標題與獎金
				// 構建標題：包含下注期間日期（以數字形式顯示）
				var titleText = "";
				if (isGroup) {
					titleText = item.groupName || "";
				} else {
					titleText = stage.stageName + " 場" + (itemIdx+1);
				}

				// 生成日期範圍的數字形式 HTML
				var titleHtml = '';
				if (stage.betStartDate && stage.betEndDate) {
					var startDay = extractDayNumbers(stage.betStartDate);
					var endDay = extractDayNumbers(stage.betEndDate);
					titleHtml += '<div class="nums"><ul>';
					// 添加起始日期的數字
					for (var i = 0; i < startDay.length; i++) {
						titleHtml += '<li class="num-' + startDay[i] + '"></li>';
					}
					// 添加斜杠
					titleHtml += '<li class="num-slash"></li>';
					// 添加結束日期的數字
					for (var i = 0; i < endDay.length; i++) {
						titleHtml += '<li class="num-' + endDay[i] + '"></li>';
					}
					titleHtml += '</ul></div>';
				}
				titleHtml += '';
				$("#betPageTitleWords").html(titleHtml);
				$("#betPagePrize").text(fmtNum(stage.prizeAmount));

				if (isGroup) {
					// ── 分組賽：每隊一張 slide，置中的即為投注目標 ──
					$("#betGameBox").hide();
					$("#betPredictBox").show();

					var teams = item.teams || [], html = "";
					var groupHasWinner = item.winnerTeamId > 0;
					for (var k = 0; k < teams.length; k++) {
						var t = teams[k];
						var slideClass = "swiper-slide";
						if (t.isWinner) slideClass += " win";
						html += '<div class="' + slideClass + '" data-medal="' + t.medalCount + '">' +
							'<div class="betbox"><div class="betbox__nation' + (t.myBets > 0 ? " tw" : "") + '">' +
							(t.teamIcon ? '<img src="' + t.teamIcon + '">' : t.teamName) + '</div>' +
							'<div class="betbox__teamName"><p>' + t.teamName + '</p></div>' +
							'<div class="betbox__allBetNum"><p>' + fmtNum(t.totalBets) + '</p></div>' +
							'<div class="betbox__myBetNum"><p>我已投注：' + fmtNum(t.myBets) + '</p></div>' +
							'<div class="betbox__betting">' +
							'<div class="btn btn-reduce"></div>' +
							'<input type="text" value="0" class="betNum" data-medal="' + t.medalCount + '">' +
							'<div class="btn btn-add"></div></div></div></div>';
					}
					$("#betPredictWrapper").html(html);

					var perView = Math.min(3, teams.length);
					var canLoop = teams.length >= perView * 2;
					g_betPredSwiper = new Swiper("#betPredictBox .betpage__betbox-bet", {
						autoplay: false, allowTouchMove: true,
						slidesPerView: perView, spaceBetween: 0,
						centeredSlides: true, loop: canLoop,
						navigation: {
							nextEl: "#betPredictBox .swiper-button-next",
							prevEl: "#betPredictBox .swiper-button-prev"
						}
					});
				} else {
					// ── 淘汰賽：主客兩隊並列，點擊切換選中，無導覽箭頭 ──
					$("#betPredictBox").hide();
					$("#betGameBox").show();

					var teams = [], html = "";
					if (item.homeTeam) teams.push(item.homeTeam);
					if (item.awayTeam) teams.push(item.awayTeam);

					for (var k = 0; k < teams.length; k++) {
						var t = teams[k], isActive = (k === 0);
						// 規格：active slide 的 btn-reduce 帶 off（初始值 0），非 active 不帶 off
						html += '<div class="swiper-slide' + (isActive ? " swiper-slide-active" : "") +
							'" data-medal="' + t.medalCount + '">' +
							'<div class="betbox"><div class="betbox__nation' + (isActive ? " tw" : "") + '">' +
							(t.teamIcon ? '<img src="' + t.teamIcon + '">' : t.teamName) + '</div>' +
							'<div class="betbox__teamName"><p>' + t.teamName + '</p></div>' +
							'<div class="betbox__allBetNum"><p>' + fmtNum(t.totalBets) + '</p></div>' +
							'<div class="betbox__myBetNum"><p>我已投注：' + fmtNum(t.myBets) + '</p></div>' +
							'<div class="betbox__betting">' +
							'<div class="btn btn-reduce' + (isActive ? " off" : "") + '"></div>' +
							'<input type="text" value="0" class="betNum" data-medal="' + t.medalCount + '">' +
							'<div class="btn btn-add"></div></div></div></div>';
					}
					$("#betGameWrapper").html(html);

					// Swiper（兩欄並列，不可滑動，點擊切換）
					g_betPredSwiper = new Swiper("#betGameBox .betpage__betbox-bet", {
						autoplay: false, allowTouchMove: false,
						slidesPerView: teams.length || 2, spaceBetween: 0,
						centeredSlides: false, loop: false
					});

					$("#betGameWrapper .swiper-slide").on("click", function () {
						$("#betGameWrapper .swiper-slide")
							.removeClass("swiper-slide-active")
							.find(".betbox__nation").removeClass("tw");
						$("#betGameWrapper .swiper-slide .btn-reduce").addClass("off");
						$(this).addClass("swiper-slide-active").find(".betbox__nation").addClass("tw");
						$(this).find(".btn-reduce").toggleClass("off", parseInt($(this).find(".betNum").val()) === 0);
					});
				}
				bindBetControls();

				// 如果投注已結束，隱藏投注控制區並添加 off 類
				if (isBetEnded(stage.betEndDateISO)) {
					// 為所有 swiper-slide 添加 off 類
					$("#betPredictBox .swiper-slide, #betGameBox .swiper-slide").addClass("off");
					// 隱藏投注相關 UI
					$(".betbox__betting").hide();
					$(".betpage__note").hide();
					$(".betpage__betBtns").hide();
				} else {
					// 確保投注未結束時顯示這些元素
					$(".betbox__betting").show();
					$(".betpage__note").show();
					$(".betpage__betBtns").show();
				}

				betpage();
			}

			function bindBetControls() {
				$(".betbox__betting .btn-reduce").off("click").on("click", function () {
					if ($(this).hasClass("off")) return;
					var $btn = $(this), inp = $btn.siblings(".betNum"), v = parseInt(inp.val())||0;
					if (v > 0) {
						inp.val(v - 1);
						if (v - 1 === 0) $btn.addClass("off");
					}
				});
				$(".betbox__betting .btn-add").off("click").on("click", function () {
					var inp = $(this).siblings(".betNum"), v = parseInt(inp.val())||0;
					// 計算目前所有投注欄位的總和（排除當前欄位）
					var totalOther = 0;
					$(".betNum").not(inp).each(function() { totalOther += parseInt($(this).val()) || 0; });
					var maxForThis = g_nItemAmount - totalOther;
					if (v < maxForThis) {
						inp.val(v + 1);
						$(this).siblings(".btn-reduce").removeClass("off");
					}
				});
				// 離開 input 時驗證輸入值
				$(".betNum").off("blur").on("blur", function () {
					var v = parseInt($(this).val()) || 0;
					if (isNaN(v) || v < 0) {
						v = 0;
					}
					// 計算所有其他投注欄位的總和
					var totalOther = 0;
					var self = this;
					$(".betNum").not(self).each(function() { totalOther += parseInt($(this).val()) || 0; });
					var maxForThis = g_nItemAmount - totalOther;
					if (v > maxForThis) {
						v = maxForThis;
						AlertMessage("投注數量已調整為最大可投注數 " + v, { icon: "info", timer: 1500, showConfirmButton: false });
					}
					$(this).val(v);
					// 如果值為 0，禁用減少按鈕
					if (v === 0) {
						$(this).siblings(".btn-reduce").addClass("off");
					} else {
						$(this).siblings(".btn-reduce").removeClass("off");
					}
				});
			}

			// ── 提交投注 ──
			function submitBet() {
				if (g_bIsExchanging) return;

				// 收集所有有投注的項目（medal 和 count）
				var bets = [];
				var totalBetCount = 0;
				$("#betPredictWrapper .swiper-slide, #betGameWrapper .swiper-slide").each(function() {
					var medal = parseInt($(this).attr("data-medal")) || -1;
					var count = parseInt($(this).find(".betNum").val()) || 0;
					if (medal > 0 && count > 0) {
						bets.push({medal: medal, count: count});
						totalBetCount += count;
					}
				});

				// 檢查是否有投注
				if (bets.length === 0) {
					AlertMessage("請輸入要投注的數量！");
					return;
				}

				// 檢查總投注數是否超過玩家持有的票券數
				if (totalBetCount > g_nItemAmount) {
					AlertMessage("投注總數 " + totalBetCount + " 超過持有票券數 " + g_nItemAmount + "，請重新調整！", {
						title: "投注數量錯誤",
						icon: "warning"
					});
					return;
				}

				// 二次確認對話框
				var confirmMsg = "<div style='text-align:left;padding:0 10px;'>";
				for (var bi = 0; bi < bets.length; bi++) {
					var $sl = $(".swiper-slide[data-medal='" + bets[bi].medal + "']");
					var teamName = $sl.find(".betbox__teamName p").text() || "隊伍";
					confirmMsg += "<p>" + teamName + "：<strong>" + bets[bi].count + "</strong> 張</p>";
				}
				confirmMsg += "<hr style='border-color:rgba(255,255,255,0.2);margin:8px 0;'><p>共計：<strong style='color:#FFEA00;font-size:1.2em;'>" + totalBetCount + "</strong> 張競猜券</p></div>";
				swal.fire({
					title: "確認投注",
					html: confirmMsg,
					icon: "question",
					showCancelButton: true,
					confirmButtonText: "確定投注",
					cancelButtonText: "再想想",
					confirmButtonColor: "#28a745",
					cancelButtonColor: "#6c757d"
				}).then(function(result) {
					if (result.isConfirmed) {
						doSubmitBet(bets, totalBetCount);
					}
				});
			}

			function doSubmitBet(bets, totalBetCount) {

				g_bIsExchanging = true;
				$("#loadingWord").html('正在投注中...再一下下就好囉！');
				$(".loading_wrp").show();
				// 禁用投注相關按鈕
				$(".btn_bet, .btn__question, .btn__record, #mainBetWrapper .betbox__BetBtn").prop("disabled", true).css("opacity", "0.5");

				// 一次性提交所有投注（批量投注 API）
				var betArray = [];
				for (var i = 0; i < bets.length; i++) {
					betArray.push({t: bets[i].medal, c: bets[i].count});
				}

				$.ajax({
					url:"x_DoPrizeTrans.aspx", type:"POST", dataType:"json",
					data: {bets: JSON.stringify(betArray)},
					cache: false,
					success: function(resp) {
						$(".loading_wrp").hide();
						$(".btn_bet, .btn__question, .btn__record, #mainBetWrapper .betbox__BetBtn").prop("disabled", false).css("opacity", "1");

						if (resp.STATUS === 0) {
							// 更新票券數量
							g_nItemAmount = resp.RESULT.SURPLUS_PRIZE_COUNT;
							$("#itemAmountDisplay, #betPageItemCount").text(fmtNum(g_nItemAmount));

							// 更新投注統計（從返回的 TABLE_DATA 重新建構）
							if (resp.RESULT.TABLE_DATA) {
								try {
									var tableData = JSON.parse(resp.RESULT.TABLE_DATA);
									for (var key in tableData) {
										var medal = parseInt(key);
										if (!g_csAllStages) continue;
										// 更新所有 stage 中該 medal_count 的數據
										for (var si = 0; si < g_csAllStages.length; si++) {
											var stage = g_csAllStages[si];
											for (var ii = 0; ii < stage.items.length; ii++) {
												var item = stage.items[ii];
												var itemTeams = stage.isGroupStage ? item.teams : [];
												if (!stage.isGroupStage) {
													if (item.homeTeam) itemTeams.push(item.homeTeam);
													if (item.awayTeam) itemTeams.push(item.awayTeam);
												}
												for (var ti = 0; ti < itemTeams.length; ti++) {
													if (itemTeams[ti].medalCount === medal) {
														itemTeams[ti].totalBets = tableData[key].totalCount;
														itemTeams[ti].myBets = tableData[key].personalCount;
													}
												}
											}
										}
									}
									// 重新計算 item 級別的投注統計匯總
									for (var si = 0; si < g_csAllStages.length; si++) {
										var stage = g_csAllStages[si];
										for (var ii = 0; ii < stage.items.length; ii++) {
											var item = stage.items[ii];
											var itemTeams = stage.isGroupStage ? item.teams : [];
											if (!stage.isGroupStage) {
												if (item.homeTeam) itemTeams.push(item.homeTeam);
												if (item.awayTeam) itemTeams.push(item.awayTeam);
											}
											var totalBets = 0, myBets = 0;
											for (var ti = 0; ti < itemTeams.length; ti++) {
												totalBets += itemTeams[ti].totalBets || 0;
												myBets += itemTeams[ti].myBets || 0;
											}
											item.totalBets = totalBets;
											item.myBets = myBets;
										}
									}
									// 重新渲染主投注區
									renderMainBet(g_selectedStageKey);
								} catch(e) {
									console.error("Failed to parse TABLE_DATA:", e);
								}
							}

							// 關閉 popup 並顯示投注成功提示
							btn_x();
							AlertMessage("<strong style='font-size:18px;'>投注成功！</strong><br/>已成功提交 " + bets.length + " 筆投注", {
								icon: "success",
								timer: 2000,
								showConfirmButton: false
							});
						} else {
							AlertMessage("<strong style='font-size:16px;'>投注失敗</strong><br/>" + (resp.MESSAGE || "請稍後再試。"), {
								icon: "error"
							});
						}
						g_bIsExchanging = false;
					},
					error: function() {
						$(".loading_wrp").hide();
						$(".btn_bet, .btn__question, .btn__record, #mainBetWrapper .betbox__BetBtn").prop("disabled", false).css("opacity", "1");
						AlertMessage("伺服器連線異常，請稍後再試。");
						g_bIsExchanging = false;
					}
				});
			}

			// ── 渲染我的押注紀錄 ──
			function renderRecord() {
				var html = "";
				for (var i = 0; i < g_csAllStages.length; i++) {
					var stage = g_csAllStages[i];
					var stageEnded = isBetEnded(stage.betEndDateISO);
					if (stage.isGroupStage) {
						for (var j = 0; j < stage.items.length; j++) {
							var grp = stage.items[j];
							for (var k = 0; k < grp.teams.length; k++) {
								var t = grp.teams[k];
								if (t.myBets > 0) {
									var resultHtml = '<span style="color:#aaa">進行中</span>';
									if (stageEnded && grp.winnerTeamId > 0) {
										resultHtml = t.isWinner
											? '<span style="color:#4cff4c">✓ 猜中</span>'
											: '<span style="color:#ff6b6b">✗ 未中</span>';
									} else if (stageEnded) {
										resultHtml = '<span style="color:#ffd180">等待開獎</span>';
									}
									html += "<tr><td>"+stage.stageName+" "+grp.groupName+"</td><td>" +
										(t.teamIcon?'<img src="'+t.teamIcon+'" title="'+t.teamName+'" style="height:24px">':t.teamName) +
										"</td><td>"+fmtNum(t.myBets)+"</td><td>"+resultHtml+"</td></tr>";
								}
							}
						}
					} else {
						for (var j = 0; j < stage.items.length; j++) {
							var m = stage.items[j];
							var teams = [m.homeTeam, m.awayTeam];
							for (var k = 0; k < teams.length; k++) {
								var t = teams[k];
								if (t && t.myBets > 0) {
									var resultHtml = '<span style="color:#aaa">進行中</span>';
									if (stageEnded && m.winnerTeamId > 0) {
										resultHtml = (t.teamId === m.winnerTeamId)
											? '<span style="color:#4cff4c">✓ 猜中</span>'
											: '<span style="color:#ff6b6b">✗ 未中</span>';
									} else if (stageEnded) {
										resultHtml = '<span style="color:#ffd180">等待開獎</span>';
									}
									html += "<tr><td>"+stage.stageName+" 場"+(j+1)+"</td><td>" +
										(t.teamIcon?'<img src="'+t.teamIcon+'" title="'+t.teamName+'" style="height:24px">':t.teamName) +
										"</td><td>"+fmtNum(t.myBets)+"</td><td>"+resultHtml+"</td></tr>";
								}
							}
						}
					}
				}
				if (!html) html = '<tr><td colspan="4" style="text-align:center">尚無押注紀錄</td></tr>';
				$("#recordTableBody").html(html);
			}

			// ── popup 控制 ──
			function question() { $(".popup,.ingame__popup--bg,.question").addClass("show"); }
			function record()   { renderRecord(); $(".popup,.ingame__popup--bg,.record").addClass("show"); }
			function betpage()  { $(".popup,.ingame__popup--bg,.betpage").addClass("show"); }
			function btn_x()    { $(".popup,.ingame__popup--bg,.popup__main").removeClass("show"); }

			// ── 初始化倒計時 ──
			function initCountdown() {
				if (g_dtCurrentStageBetEnd && g_dtCurrentStageBetEnd > new Date()) {
					$("#countdownDisplay").countdown({
						until: g_dtCurrentStageBetEnd,
						layout: '{d10}{d1}天 {h10}{h1}時 {m10}{m1}分'
					});
				} else {
					$("#countdownDisplay").html('已結束投券');
				}
			}

			// ── 初始化 ──
			$(document).ready(function () {
				// 預設選最新可見階段（或當前開放投注階段）
				var defaultKey = g_strCurrentStage || "";
				if (!defaultKey) {
					for (var i = 0; i < g_csAllStages.length; i++) {
						if (g_csAllStages[i].isVisible) { defaultKey = g_csAllStages[i].stageKey; break; }
					}
				}
				renderGameSwitch(defaultKey);
				if (defaultKey) renderMainBet(defaultKey);

				// 初始化倒計時
				initCountdown();

				// gameswitch toggle
				$(".gameswitch").on("click", function (e) {
					if ($(e.target).closest(".gameswitch__list").length) return;
					$(".gameswitch__list,.gameswitch").toggleClass("show");
				});

				$(".btn__question").on("click", question);
				$(".btn__record").on("click", record);
				$(".btn-close, .ingame__popup--bg").on("click", btn_x);
				$(".btn_betClear").on("click", function () { $(".betNum").val("0"); });
				$(".btn_betSure").on("click", submitBet);
			});
		</script>
	</div>
</body>
</html>
<!-- #include virtual="/include/i_PageEnd.aspx" -->