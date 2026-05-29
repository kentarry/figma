<%--------------------------------------------------------------------------------------------------------------------
	程式應用：玩家領獎

	程式規則：
	  - WIN_AMOUNT 由排程（x_DoCalcWinAmount.aspx）提前計算好存入 DB
	  - 本頁只負責查詢未領獎項並執行領獎

	修改歷史：
--------------------------------------------------------------------------------------------------------------------%>
<%@ Page Language="C#" %>
<%@ Import Namespace = "System.Data.SqlClient" %>
<%@ import namespace = "GameTower.Web.Bank.Action.PrizeTrans"%>
<%@ Import Namespace = "Newtonsoft.Json" %>
<%@ Import Namespace = "Newtonsoft.Json.Linq" %>
<!-- #include virtual="i_setup.aspx" -->
<!-- #include virtual="/Bank/i_define.aspx" -->
<!-- #include virtual="/Action/include/i_define.aspx" -->
<!-- #include virtual="i_ActionSetup.aspx" -->
<script language="C#" runat="server">
</script>
<%
	const string							g_strPageName	= strActionName ;
	bool									bDebugMode		= false ;

	GT_DBAdapter					csWebDBA				= null ;
	GT_DBAdapter					csCasinoDBA				= null ;
	GT_DBCommand					csCommand				= null ;
	GT_DBTransaction				csWebTransaction		= null ;

	int								nErrorCount				= 0 ;
	JObject							csJson					= new JObject() ;
	string							strProcessMemo			= string.Empty ;
	string							strErrorMsg				= string.Empty ;

	int								nWin					= -1 ;		// 相容舊流程，此活動固定傳 0
	int								nWinAmount				= 0 ;		// 玩家未領總獎金
	bool							bIsGet					= false ;	// 是否已全部領取

	if (nErrorCount == 0 && !G.COMMON.bIsDemo)
	{
		if (!g.csWU.bMemberLogined)
		{
			nErrorCount++ ;
			strErrorMsg = "閒置過久，請重新進入活動頁！" ;
		}
	}

	// 查詢未領獎項，若有則執行領獎
	if (nErrorCount == 0)
	{
		if (!GetWinPoint(g.dtNow, out nWin))
		{
			strErrorMsg = "伺服器忙碌中，請稍後再試。(3)" ;
			nErrorCount++ ;
		}
		// 先以不領獎模式查詢，確認是否有獎可領
		else if (!GetWinAmount(g.csWU.nMemberNo, g.dtNow, nWin, false, out nWinAmount, out bIsGet))
		{
			nErrorCount++ ;
			strErrorMsg = "伺服器忙碌中，請稍後再試。(4)" ;
		}
	}

	if (!G.COMMON.bIsDemo)
	{
		if (nErrorCount == 0)
		{
			// 有獎可領且玩家尚未領取
			if (!bIsGet && nWinAmount > 0)
			{
				if (!GetWinAmount(g.csWU.nMemberNo, g.dtNow, nWin, true, out nWinAmount, out bIsGet))
				{
					nErrorCount++ ;
					strErrorMsg = "伺服器忙碌中，請稍後再試。(5)" ;
				}
			}
		}
	}

	csJson.Add(new JProperty("STATUS",		nErrorCount > 0 ? -99 : 0)) ;
	csJson.Add(new JProperty("MESSAGE",		strErrorMsg)) ;
	csJson.Add(new JProperty("WIN_AMOUNT",	nWinAmount)) ;
	csJson.Add(new JProperty("BISGET",		bIsGet)) ;

	if (!bDebugMode)
	{
		Response.Clear() ;
		Response.ContentType = "application/json" ;
		Response.Write(csJson.ToString(Newtonsoft.Json.Formatting.None)) ;
	}

	if (csWebDBA != null)		csWebDBA.Close() ;
	if (csCasinoDBA != null)	csCasinoDBA.Close() ;
	if (csCommand != null)		csCommand.Dispose() ;
	if (csWebTransaction != null) csWebTransaction.Dispose() ;
%>
