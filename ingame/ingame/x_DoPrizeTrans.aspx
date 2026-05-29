<%--------------------------------------------------------------------------------------------------------------------
	程式應用：玩家投注（扣除下注券、更新投注數量）

	程式規則：
	  - 參數 bets：批量投注 JSON 陣列 [{"t": medal_count, "c": count}, ...]
	  - 或參數 t：單筆投注的 MEDAL_COUNT（投注標的ID）
	      分組賽 = 組別序號(1-12) × 10000 + ACTION_WorldCupTeam.ID
	      淘汰賽 = ACTION_WorldCupMatchInfo.INDEX_NO × 10000 + ACTION_WorldCupTeam.ID
	  - 參數 c：投注數量（張數，搭配 t 使用）
	  - 依當前階段自動選擇正確的下注券道具ID

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
	const string							g_strPageName						= strActionName ;
	bool									bDebugMode							= false ;

	GT_DBAdapter					csWebDBA									= null ;
	GT_DBAdapter					csCasinoDBA									= null ;
	GT_DBCommand					csCommand									= null ;
	GT_DBTransaction				csWebTransaction							= null ;

	// 支援批量投注：bets = [{"t": medal_count, "c": count}, ...]
	// 或單筆投注：t = MEDAL_COUNT，c = 投注數量
	List<KeyValuePair<int, int>>	listBets									= new List<KeyValuePair<int, int>>() ;

	int								nErrorCount									= 0 ;
	JObject							csJson										= new JObject() ;
	TEST_ERROR						eTestError									= TEST_ERROR.NONE ;
	GT_MultiWebsiteLocker			csMemberLocker								= null ;
	string							strProcessMemo								= string.Empty ;
	Dictionary<int, GT_TicketData>	csTicketDataColl							= new Dictionary<int, GT_TicketData>() ;

	int								nStatus										= 0 ;
	string							strMessage									= string.Empty ;
	int								nTotalBetCount								= 0 ;

	// 取得當前階段
	GT_StageInfo					csCurrentBetStage							= GetCurrentBetStage(g.dtNow) ;

	// 解析投注信息（批量或單筆）
	// 優先從 POST 的 Form 讀取，再從 QueryString 讀取（向後相容）
	string strBets = !string.IsNullOrEmpty(Request.Form["bets"]) ? Request.Form["bets"] : Request.QueryString["bets"] ;
	if (!string.IsNullOrEmpty(strBets))
	{
		try
		{
			JArray jaBets = JArray.Parse(strBets) ;
			foreach (JToken jt in jaBets)
			{
				int nMedal = GT.GetValue(jt["t"], -1) ;
				int nCount = GT.GetValue(jt["c"], 0) ;
				if (nMedal > 0 && nCount > 0)
				{
					listBets.Add(new KeyValuePair<int, int>(nMedal, nCount)) ;
					nTotalBetCount += nCount ;
				}
			}
		}
		catch { }
	}
	else
	{
		// 單筆投注（向後相容 QueryString 方式）
		int q_nMedalCount = GT.GetValue(Request.QueryString["t"], -1) ;
		int q_nCount = GT.GetValue(Request.QueryString["c"], 0) ;
		if (q_nMedalCount > 0 && q_nCount > 0)
		{
			listBets.Add(new KeyValuePair<int, int>(q_nMedalCount, q_nCount)) ;
			nTotalBetCount = q_nCount ;
		}
	}

	// 檢查是否有有效投注
	if (listBets.Count == 0)
	{
		nErrorCount++ ;
		csJson.Add(new JProperty("STATUS",  -99)) ;
		csJson.Add(new JProperty("MESSAGE", "投注標的資料異常，請重新進入活動頁")) ;
	}

	if (nErrorCount == 0 && !G.COMMON.bIsDemo)
	{
		// 檢查是否在活動下注期間
		if (csCurrentBetStage == null)
		{
			nErrorCount++ ;
			csJson.Add(new JProperty("STATUS",  -3)) ;
			csJson.Add(new JProperty("MESSAGE", "目前非下注期間！")) ;
		}
		else if (!g.csWU.bMemberLogined)
		{
			nErrorCount++ ;
			csJson.Add(new JProperty("STATUS",  -700)) ;
			csJson.Add(new JProperty("MESSAGE", "閒置過久，請重新進入活動頁！")) ;
		}
	}

	// 取得玩家道具數量（使用當前階段的道具ID）
	if (nErrorCount == 0)
	{
		if (!GetActionItemCount(g.csWU, g.dtNow, out nItemAmount, out bHasPlayGame))
		{
			nErrorCount++ ;
			csJson.Add(new JProperty("STATUS",  -99)) ;
			csJson.Add(new JProperty("MESSAGE", "伺服器忙碌中，請稍後再試。(1)")) ;
		}
		else if (nItemAmount < 1)
		{
			nErrorCount++ ;
			csJson.Add(new JProperty("STATUS",  -800)) ;
			csJson.Add(new JProperty("MESSAGE", "目前下注券不足，快至遊戲任務獲得吧。")) ;

			JObject csResult = new JObject() ;
			csResult.Add(new JProperty("SURPLUS_PRIZE_COUNT", nItemAmount)) ;
			csJson.Add(new JProperty("RESULT", csResult)) ;
		}
		else if (nTotalBetCount > nItemAmount)
		{
			// 總投注數超過可用票券
			nErrorCount++ ;
			csJson.Add(new JProperty("STATUS",  -800)) ;
			csJson.Add(new JProperty("MESSAGE", "下注券不足，無法完成此投注。")) ;

			JObject csResult = new JObject() ;
			csResult.Add(new JProperty("SURPLUS_PRIZE_COUNT", nItemAmount)) ;
			csJson.Add(new JProperty("RESULT", csResult)) ;
		}
	}

	// 執行投注
	if (!G.COMMON.bIsDemo)
	{
		JObject		csResult	= new JObject() ;
		string		strErrorMsg	= string.Empty ;

		if (nErrorCount == 0)
		{
			csMemberLocker = new GT_MultiWebsiteLocker(
				GT_LOCKER_MODULE.ACCOUNT,
				Enum.IsDefined(typeof(GT_LOCKER_TEST_ERROR), eTestError.ToString())
					? (GT_LOCKER_TEST_ERROR) Enum.Parse(typeof(GT_LOCKER_TEST_ERROR), eTestError.ToString())
					: GT_LOCKER_TEST_ERROR.NONE) ;

			csMemberLocker.rgstrKeyword.Add(g.csWU.strID + csCurrentBetStage.strItemId) ;

			if (csMemberLocker.Lock(true, 3000))
			{
				csWebDBA	= a_csWS.csDBAManager.CreateDBAdapter() ;
				csCasinoDBA	= a_csWS.csDBAManager.CreateDBAdapter() ;

				if (!csWebDBA.Connection("GAMETOWER_WEB"))
				{
					a_csWS.csTextLogColl["WEB"].WriteLog(csWebDBA.strErrorMessage) ;
					nErrorCount++ ;
					nStatus		= -99 ;
					strMessage	= "伺服器忙碌中，請稍後再試。(5)" ;
				}
				else if (!csCasinoDBA.Connection("GAMETOWER2_GT_CASINO"))
				{
					a_csWS.csTextLogColl["WEB"].WriteLog(csCasinoDBA.strErrorMessage) ;
					nStatus		= -99 ;
					strMessage	= "伺服器忙碌中，請稍後再試。(6)" ;
				}

				if (nErrorCount == 0)
				{
					csCommand				= csWebDBA.csConn.CreateCommand() ;
					csWebTransaction		= csWebDBA.csConn.BeginTransaction() ;
					csCommand.Transaction	= csWebTransaction ;

					try
					{
						// 處理所有投注
						foreach (KeyValuePair<int, int> bet in listBets)
						{
							int nMedalCount = bet.Key ;
							int nCount = bet.Value ;

							// 嘗試更新既有投注記錄
							csCommand.CommandText = @"UPDATE [" + strActionDB + @"]
								SET [TICKET_COUNT] = [TICKET_COUNT] + @COUNT, [E_DATETIME] = GETDATE()
								WHERE [MEDAL_COUNT] = @MEDAL_COUNT AND [MEMBER_NO] = @MEMBER_NO" ;

							csCommand.ClearParameters() ;
							csCommand.AddInParameter("@MEDAL_COUNT",	GT_DBType.Int32,	nMedalCount) ;
							csCommand.AddInParameter("@MEMBER_NO",		GT_DBType.Int32,	g.csWU.nMemberNo) ;
							csCommand.AddInParameter("@COUNT",			GT_DBType.Int32,	nCount) ;
							strProcessMemo	= csCommand.strCommandMessage ;
							int nUpdateCount = csCommand.ExecuteNonQuery() ;

							if (nUpdateCount == 0)
							{
								// 第一次投注此標的，新增記錄
								csCommand.CommandText = @"INSERT [" + strActionDB + @"]
									([MEMBER_NO], [MEDAL_COUNT], [TICKET_COUNT], [C_DATETIME])
									VALUES (@MEMBER_NO, @MEDAL_COUNT, @COUNT, GETDATE())" ;

								strProcessMemo = csCommand.strCommandMessage ;
								csCommand.ExecuteNonQuery() ;
							}
						}

						// 扣除玩家道具（使用當前階段的道具ID，一次扣除總數）
						using (GT_DBCommand csCasinoCmd = csCasinoDBA.csConn.CreateCommand())
						{
							csCasinoCmd.CommandText = "EXEC WordCollection_WEB_UpdatePlayerItem @MEMBER_NO, @ITEM_NO, @ITEM_AMOUNT" ;
							csCasinoCmd.AddInParameter("@MEMBER_NO",	GT_DBType.Int32,	g.csWU.nMemberNo) ;
							csCasinoCmd.AddInParameter("@ITEM_NO",		GT_DBType.Int32,	a_csPrize.csPrizeDataColl[csCurrentBetStage.strItemId].nGameItemNo) ;
							csCasinoCmd.AddInParameter("@ITEM_AMOUNT",	GT_DBType.Int32,	-(nTotalBetCount)) ;
							strProcessMemo = "扣除道具（總數）：" + csCasinoCmd.strCommandMessage ;

							int nResult = GT.GetValue(csCasinoCmd.ExecuteScalar(), 0) ;

							switch (nResult)
							{
								case 0:
									break ;

								case -3:
									nErrorCount++ ;
									nStatus		= -99 ;
									strMessage	= "點數不足，請重新確認。(" + nResult + ")" ;
									break ;

								default:
									a_csWS.csTextLogColl["WEB"].WriteLog(g_strPageName + "，扣除遊戲道具失敗，回傳：" + nResult) ;
									nErrorCount++ ;
									nStatus		= -99 ;
									strMessage	= "伺服器忙碌中，請稍後再試。(7)" ;
									break ;
							}
						}

						if (nErrorCount == 0)
							csWebTransaction.Commit() ;
						else
							csWebTransaction.Rollback() ;
					}
					catch (Exception e)
					{
						nStatus		= -99 ;
						strMessage	= "伺服器忙碌中，請稍後再試。(10)" ;
						a_csWS.WriteErrorLog(g.csWU.strID, g_strPageName, e, strProcessMemo) ;
						csWebTransaction.Rollback() ;
					}
				}

				csMemberLocker.UnLock() ;
			}
			else
			{
				a_csWS.csTextLogColl["WEB"].WriteLog(g_strPageName + "，會員鎖定處理失敗！" + csMemberLocker.strErrorMessage) ;
				nErrorCount++ ;
				nStatus		= -99 ;
				strMessage	= "伺服器忙碌中，請稍後再試。(4)" ;
			}

			// 投注成功後，回傳最新道具數量與投注統計
			if (nErrorCount == 0)
			{
				if (!GetActionItemCount(g.csWU, g.dtNow, out nItemAmount, out bHasPlayGame))
				{
					nErrorCount++ ;
					nStatus		= -96 ;
					strErrorMsg	= "取得道具數量失敗。" ;
				}
				else if (!GetTicketTable(g.csWU.nMemberNo, g.dtNow, out csTicketDataColl))
				{
					nErrorCount++ ;
					nStatus		= -96 ;
					strErrorMsg	= "取得投注資訊失敗。" ;
				}
			}

			csResult.Add(new JProperty("SURPLUS_PRIZE_COUNT",	nItemAmount)) ;
			// 對於單筆投注，保持向後兼容
			if (listBets.Count == 1)
			{
				csResult.Add(new JProperty("MEDAL_COUNT",		listBets[0].Key)) ;
				csResult.Add(new JProperty("TOTAL_COUNT",		csTicketDataColl.ContainsKey(listBets[0].Key) ? csTicketDataColl[listBets[0].Key].nTotalCount		: 0)) ;
				csResult.Add(new JProperty("PERSONAL_COUNT",	csTicketDataColl.ContainsKey(listBets[0].Key) ? csTicketDataColl[listBets[0].Key].nPersonalCount	: 0)) ;
			}

			// 返回完整的投注統計資料供前端更新 UI
			JObject csTableData = new JObject() ;
			foreach (int nKey in csTicketDataColl.Keys)
			{
				csTableData.Add(nKey.ToString(), JObject.FromObject(new {
					totalCount = csTicketDataColl[nKey].nTotalCount,
					personalCount = csTicketDataColl[nKey].nPersonalCount
				})) ;
			}
			csResult.Add(new JProperty("TABLE_DATA", csTableData.ToString(Newtonsoft.Json.Formatting.None))) ;

			csJson.Add(new JProperty("STATUS",	nStatus)) ;
			csJson.Add(new JProperty("MESSAGE", strErrorMsg)) ;
			csJson.Add(new JProperty("RESULT",	csResult)) ;
		}
	}

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
