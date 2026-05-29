<%--------------------------------------------------------------------------------------------------------------------
	程式規則：

	修改歷史：

--------------------------------------------------------------------------------------------------------------------%>
<%@ import namespace = "GameTower.Web.Bank.Action.PrizeTrans"%>
<script language="C#" runat="server">
	public enum TEST_ERROR
	{
		NONE					= 0,					// 無

		// --- 跨站鎖定必要測試模式 ---
		EXECUTE_LOCK_URL,								// 鎖定代理程式執行失敗
		LOCK_URL_TIMEOUT,								// 鎖定代理程式執行逾時
		LOCK_URL_RESULT_EMPTY,							// 鎖定代理程式回應空值
		UNLOCK_URL_TIMEOUT,								// 解鎖代理程式執行逾時
		UNLOCK_URL_RESULT_EMPTY,						// 解鎖代理程式回應空值
		SELECT_LOCKED,									// 已鎖定的資料讀取發生異常
		DELETE_TIMEOUT,									// 已鎖定超時的資料刪除發生異常
		RELOAD_LOCKED,									// 已鎖定的資料重新讀取發生異常 (必須有已鎖定超時的資料被刪除，才會重新讀取已鎖定的資料)
		INSERT_LOCKED,									// 鎖定的資料寫入發生異常
		DELETE_LOCKED,									// 已鎖定的資料刪除發生異常
		EXECUTE_UNLOCK_URL,								// 解鎖代理程式執行失敗
		// ----------------------------

		POINT_DELAY,									// 扣點延遲 (非錯誤，只是會模擬讓扣點過程執行久一點)
		MEMBER_DELAY									// 會員鎖定延遲 (非錯誤，只是會模擬讓扣點過程執行久一點)
	} ;

	// ────────────────────────────────────────────────────
	// 活動常數
	// ────────────────────────────────────────────────────
	public const string		strActionName				= "猜得分拿彩金" ;
	public const string		strActionItemId1			= "FREEPLAY_240624_005" ;		// 下注券A
	public const string		strActionItemId2			= "FREEPLAY_260514_001" ;		// 下注券B
	public const string		strActionDB					= "ACTION_20260611_20260729_STAR31_MedalBet" ;

	public static DateTime	dtActionCoinGainStartDay	= new DateTime(2026, 06, 11, 12, 00, 00) ;
	public static DateTime	dtActionCoinGainEndDay		= new DateTime(2026, 07, 29, 12, 00, 00) ;
	public static DateTime	dtActionCoinGiveStartDay	= dtActionCoinGainStartDay ;
	public static DateTime	dtActionCoinGiveEndDay		= dtActionCoinGainEndDay ;
	public const string		strDemoSessionKeyStart		= "ACTION_STAR31_20260611MU_" ;

	GT_MultiWebsiteLocker	csMemberLocker				= null ;
	TEST_ERROR				eTestError					= TEST_ERROR.NONE ;
	Dictionary<int, List<int>>		csAutoDrawList		= new Dictionary<int, List<int>>() ;

	// ────────────────────────────────────────────────────
	// 賽事階段定義
	// ────────────────────────────────────────────────────
	public class GT_StageInfo
	{
		public string	strStageKey ;		// ACTION_WorldCupMatchInfo.STAGE 對應值
		public string	strStageName ;		// 中文名稱
		public DateTime	dtBetStart ;		// 開始下注時間
		public DateTime	dtBetEnd ;			// 結束下注時間（也是清除剩餘下注券的時間）
		public string	strItemId ;			// 此階段使用的下注券 PrizeId
		public long		lPrizeAmount ;		// 每場（或每組）獎池金額
		public bool		bIsGroupStage ;		// 是否為分組賽（猜晉級第一名）
		public int		nSortOrder ;		// 由新→舊的排序（0=最新）

		public GT_StageInfo(string key, string name, DateTime start, DateTime end, string itemId, long prize, bool isGroup, int sort)
		{
			strStageKey		= key ;
			strStageName	= name ;
			dtBetStart		= start ;
			dtBetEnd		= end ;
			strItemId		= itemId ;
			lPrizeAmount	= prize ;
			bIsGroupStage	= isGroup ;
			nSortOrder		= sort ;
		}
	}

	// 按階段先後順序（分組賽 → 冠軍決賽）
	public static readonly List<GT_StageInfo> csStageList = new List<GT_StageInfo>
	{
		new GT_StageInfo("GROUP_STAGE",    "分組賽",   new DateTime(2026,6,11,12,0,0),  new DateTime(2026,6,15,12,0,0),  "FREEPLAY_240624_005",  10000000L, true,  6),
		new GT_StageInfo("LAST_32",        "32強",     new DateTime(2026,6,24,12,0,0),  new DateTime(2026,6,28,12,0,0),  "FREEPLAY_260514_001",  20000000L, false, 5),
		new GT_StageInfo("LAST_16",        "16強",     new DateTime(2026,7,1, 12,0,0),  new DateTime(2026,7,4, 12,0,0),  "FREEPLAY_240624_005",  30000000L, false, 4),
		new GT_StageInfo("QUARTER_FINALS", "半準決賽", new DateTime(2026,7,8, 12,0,0),  new DateTime(2026,7,9, 12,0,0),  "FREEPLAY_260514_001",  50000000L, false, 3),
		new GT_StageInfo("SEMI_FINALS",    "準決賽",   new DateTime(2026,7,12,12,0,0),  new DateTime(2026,7,13,12,0,0), "FREEPLAY_240624_005",  70000000L, false, 2),
		new GT_StageInfo("THIRD_PLACE",    "季軍賽",   new DateTime(2026,7,16,12,0,0),  new DateTime(2026,7,17,12,0,0), "FREEPLAY_260514_001", 100000000L, false, 1),
		new GT_StageInfo("FINAL",          "冠軍決賽", new DateTime(2026,7,17,12,0,0),  new DateTime(2026,7,18,12,0,0), "FREEPLAY_240624_005", 200000000L, false, 0),
	} ;

	// 組別名稱 → 組別序號（1-12），用於計算 MEDAL_COUNT
	public static readonly Dictionary<string, int> csGroupOrdinalMap = new Dictionary<string, int>
	{
		{"GROUP_A",1},{"GROUP_B",2},{"GROUP_C",3},{"GROUP_D",4},
		{"GROUP_E",5},{"GROUP_F",6},{"GROUP_G",7},{"GROUP_H",8},
		{"GROUP_I",9},{"GROUP_J",10},{"GROUP_K",11},{"GROUP_L",12},
	} ;

	// ────────────────────────────────────────────────────
	// MEDAL_COUNT 編碼規則
	//   分組賽：groupOrdinal(1-12) * 10000 + TEAM_ID
	//   淘汰賽：MATCH_INDEX_NO * 10000 + TEAM_ID
	// ────────────────────────────────────────────────────
	public int EncodeMedalCount(bool bIsGroupStage, int nGroupOrMatchId, int nTeamId)
	{
		return nGroupOrMatchId * 10000 + nTeamId ;
	}

	public void DecodeMedalCount(int nMedalCount, out int nGroupOrMatchId, out int nTeamId)
	{
		nGroupOrMatchId	= nMedalCount / 10000 ;
		nTeamId			= nMedalCount % 10000 ;
	}

	// ────────────────────────────────────────────────────
	// 取得目前開放下注的階段（null = 非下注期間）
	// ────────────────────────────────────────────────────
	public GT_StageInfo GetCurrentBetStage(DateTime _dtNow)
	{
		foreach (GT_StageInfo cs in csStageList)
		{
			if (_dtNow >= cs.dtBetStart && _dtNow < cs.dtBetEnd)
				return cs ;
		}
		return null ;
	}

	// 取得玩家目前應使用的道具ID（依當前階段）
	public string GetCurrentItemId(DateTime _dtNow)
	{
		GT_StageInfo csStage = GetCurrentBetStage(_dtNow) ;
		return csStage != null ? csStage.strItemId : strActionItemId1 ;
	}

	// ────────────────────────────────────────────────────
	// 比賽資料類別
	// ────────────────────────────────────────────────────
	public class GT_MatchData
	{
		public int		nIndexNo ;
		public string	strStageKey ;
		public string	strGroup ;			// 僅分組賽有值
		public int		nHomeTeamId ;
		public int		nAwayTeamId ;
		public int		nWinnerTeamId ;		// -1 = 尚未產生結果
		public string	strHomeTeamName ;
		public string	strHomeTeamIcon ;
		public string	strAwayTeamName ;
		public string	strAwayTeamIcon ;

		public class TeamInfo
		{
			public int		nTeamId ;
			public string	strName ;
			public string	strIcon ;
		}
	}

	// ────────────────────────────────────────────────────
	// 從 DB 取得指定階段的比賽列表（含隊伍資訊）
	// ────────────────────────────────────────────────────
	public bool GetMatchList(string _strStageKey, out List<GT_MatchData> _csMatchList)
	{
		GT_DBAdapter	csWebDBA	= null ;
		GT_DBCommand	csCommand	= null ;
		GT_DBReader		csDR		= null ;
		string			strMemo		= string.Empty ;
		bool			bRe			= false ;

		_csMatchList = new List<GT_MatchData>() ;

		if (G.COMMON.bIsDemo)
		{
			// Demo 資料：回傳假資料
			_csMatchList.Add(new GT_MatchData { nIndexNo=201, strStageKey=_strStageKey, nHomeTeamId=769, nAwayTeamId=774, nWinnerTeamId=-1, strHomeTeamName="隊伍A", strHomeTeamIcon="", strAwayTeamName="隊伍B", strAwayTeamIcon="" }) ;
			return true ;
		}

		try
		{
			csWebDBA = a_csWS.csDBAManager.CreateDBAdapter() ;
			if (!csWebDBA.Connection("GAMETOWER_WEB"))
			{
				a_csWS.csTextLogColl["WEB"].WriteLine(csWebDBA.strErrorMessage) ;
				return false ;
			}

			csCommand = csWebDBA.csConn.CreateCommand() ;
			csCommand.CommandText = @"
			SELECT		m.[INDEX_NO], m.[STAGE], m.[GROUP],
						m.[HOME_TEAM_ID], m.[AWAY_TEAM_ID],
						CASE WHEN m.[WINNER] = 'HOME_TEAM' THEN m.[HOME_TEAM_ID]
							 WHEN m.[WINNER] = 'AWAY_TEAM' THEN m.[AWAY_TEAM_ID]
							 ELSE -1 END AS [WINNER_TEAM_ID],
						ht.[NAME_CN] AS [HOME_NAME], ht.[ICON_URL] AS [HOME_ICON],
						at.[NAME_CN] AS [AWAY_NAME], at.[ICON_URL] AS [AWAY_ICON]
			FROM		[GameTower_Web].[dbo].[ACTION_WorldCupMatchInfo] m WITH(NOLOCK)
			LEFT JOIN	[GameTower_Web].[dbo].[ACTION_WorldCupTeam] ht WITH(NOLOCK) ON ht.[ID] = m.[HOME_TEAM_ID] AND ht.[YEAR] = 2026
			LEFT JOIN	[GameTower_Web].[dbo].[ACTION_WorldCupTeam] at WITH(NOLOCK) ON at.[ID] = m.[AWAY_TEAM_ID] AND at.[YEAR] = 2026
			WHERE		m.[YEAR] = 2026 AND m.[STAGE] = @STAGE
			ORDER BY	m.[INDEX_NO]" ;

			csCommand.ClearParameters() ;
			csCommand.AddInParameter("@STAGE", GT_DBType.AnsiString, _strStageKey) ;
			strMemo	= csCommand.strCommandMessage ;
			csDR	= csCommand.ExecuteReader() ;

			while (csDR.Read())
			{
				_csMatchList.Add(new GT_MatchData
				{
					nIndexNo		= GT.GetValue(csDR["INDEX_NO"], 0),
					strStageKey		= GT.GetValue(csDR["STAGE"], ""),
					strGroup		= GT.GetValue(csDR["GROUP"], ""),
					nHomeTeamId		= GT.GetValue(csDR["HOME_TEAM_ID"], -1),
					nAwayTeamId		= GT.GetValue(csDR["AWAY_TEAM_ID"], -1),
					nWinnerTeamId	= GT.GetValue(csDR["WINNER_TEAM_ID"], -1),
					strHomeTeamName	= GT.GetValue(csDR["HOME_NAME"], ""),
					strHomeTeamIcon	= GT.GetValue(csDR["HOME_ICON"], ""),
					strAwayTeamName	= GT.GetValue(csDR["AWAY_NAME"], ""),
					strAwayTeamIcon	= GT.GetValue(csDR["AWAY_ICON"], ""),
				}) ;
			}
			csDR.Close() ;

			bRe = true ;
		}
		catch (Exception e)
		{
			a_csWS.WriteErrorLog(e, strMemo) ;
		}
		finally
		{
			if (csDR != null)		csDR.Close() ;
			if (csCommand != null)	csCommand.Dispose() ;
			if (csWebDBA != null)	csWebDBA.Dispose() ;
		}

		return bRe ;
	}

	// ────────────────────────────────────────────────────
	// 取得分組賽的各組隊伍列表（用於玩家投注分組第一名）
	// 回傳：key=GROUP_A...GROUP_L，value=隊伍列表
	// ────────────────────────────────────────────────────
	public bool GetGroupTeams(out Dictionary<string, List<GT_MatchData.TeamInfo>> _csGroupTeams)
	{
		GT_DBAdapter	csWebDBA	= null ;
		GT_DBCommand	csCommand	= null ;
		GT_DBReader		csDR		= null ;
		string			strMemo		= string.Empty ;
		bool			bRe			= false ;

		_csGroupTeams = new Dictionary<string, List<GT_MatchData.TeamInfo>>() ;

		if (G.COMMON.bIsDemo)
		{
			_csGroupTeams["GROUP_A"] = new List<GT_MatchData.TeamInfo>
			{
				new GT_MatchData.TeamInfo { nTeamId=769, strName="隊伍1", strIcon="" },
				new GT_MatchData.TeamInfo { nTeamId=774, strName="隊伍2", strIcon="" },
			} ;
			return true ;
		}

		try
		{
			csWebDBA = a_csWS.csDBAManager.CreateDBAdapter() ;
			if (!csWebDBA.Connection("GAMETOWER_WEB"))
			{
				a_csWS.csTextLogColl["WEB"].WriteLine(csWebDBA.strErrorMessage) ;
				return false ;
			}

			csCommand = csWebDBA.csConn.CreateCommand() ;
			// 取得所有 2026 分組賽場次中的隊伍（去重），並附上隊伍名稱
			csCommand.CommandText = @"
			SELECT DISTINCT
						m.[GROUP],
						t.[ID] AS [TEAM_ID],
						t.[NAME_CN],
						t.[ICON_URL]
			FROM		(
						SELECT [GROUP], [HOME_TEAM_ID] AS [TEAM_ID] FROM [GameTower_Web].[dbo].[ACTION_WorldCupMatchInfo] WITH(NOLOCK)
						WHERE [YEAR]=2026 AND [STAGE]='GROUP_STAGE' AND [HOME_TEAM_ID] IS NOT NULL
						UNION
						SELECT [GROUP], [AWAY_TEAM_ID] FROM [GameTower_Web].[dbo].[ACTION_WorldCupMatchInfo] WITH(NOLOCK)
						WHERE [YEAR]=2026 AND [STAGE]='GROUP_STAGE' AND [AWAY_TEAM_ID] IS NOT NULL
						) m
			JOIN		[GameTower_Web].[dbo].[ACTION_WorldCupTeam] t WITH(NOLOCK) ON t.[ID] = m.[TEAM_ID] AND t.[YEAR] = 2026
			ORDER BY	m.[GROUP], t.[NAME_CN]" ;

			strMemo = csCommand.strCommandMessage ;
			csDR	= csCommand.ExecuteReader() ;

			while (csDR.Read())
			{
				string	strGroup	= GT.GetValue(csDR["GROUP"], "") ;
				if (!_csGroupTeams.ContainsKey(strGroup))
					_csGroupTeams[strGroup] = new List<GT_MatchData.TeamInfo>() ;

				_csGroupTeams[strGroup].Add(new GT_MatchData.TeamInfo
				{
					nTeamId	= GT.GetValue(csDR["TEAM_ID"], -1),
					strName	= GT.GetValue(csDR["NAME_CN"], ""),
					strIcon	= GT.GetValue(csDR["ICON_URL"], ""),
				}) ;
			}
			csDR.Close() ;

			bRe = true ;
		}
		catch (Exception e)
		{
			a_csWS.WriteErrorLog(e, strMemo) ;
		}
		finally
		{
			if (csDR != null)		csDR.Close() ;
			if (csCommand != null)	csCommand.Dispose() ;
			if (csWebDBA != null)	csWebDBA.Dispose() ;
		}

		return bRe ;
	}

	// ────────────────────────────────────────────────────
	// 取得玩家對各投注標的的投注資訊
	// key = MEDAL_COUNT（投注標的ID）
	// ────────────────────────────────────────────────────
	public class GT_TicketData
	{
		public int	nMedalCount ;		// 投注標的ID
		public int	nTotalCount ;		// 全體投注總數
		public int	nPersonalCount ;	// 玩家個人投注數
		public int	nWinAmount ;		// 獲獎金額（WIN_AMOUNT 欄位）
		public bool	bIsClaimed ;		// 是否已領獎

		public GT_TicketData(int medal, int total, int personal, int winAmt, bool claimed)
		{
			nMedalCount		= medal ;
			nTotalCount		= total ;
			nPersonalCount	= personal ;
			nWinAmount		= winAmt ;
			bIsClaimed		= claimed ;
		}
	}

	public string GetNumberLi(int _nNumber, string _strPrepend, bool _bComma)
	{
		return GetNumberLi(_nNumber, _strPrepend, _bComma, 0) ;
	}

	public string GetNumberLi(int _nNumber, string _strPrepend, bool _bComma, int _nMax)
	{
		string strRe = string.Empty ;
		string strNumber = string.Format("{0:N0}", _nMax > 0 && _nNumber > _nMax ? _nMax : _nNumber) ;

		for (int i = 0; i < strNumber.Length; i++)
		{
			if (strNumber[i] == ',')
			{
				if (_bComma)
					strRe += "<li class=\"" + _strPrepend + "num-comma\"></li>" ;
			}
			else
			{
				strRe += "<li class=\"" + _strPrepend + "num-" + strNumber[i] + "\"></li>" ;
			}
		}

		return strRe ;
	}

	public void SetDemoData(string _strPersonalKey, string _strCategory, string _strValue)
	{
		a_csWS.SetRemoteCache(_strCategory + "|" + _strPersonalKey, _strValue, DateTime.Now.AddMinutes(10)) ;
	}

	public string GetDemoData(string _strPersonalKey, string _strCategory)
	{
		string strRe = string.Empty ;
		if (!a_csWS.GetRemoteCache(_strCategory + "|" + _strPersonalKey, out strRe))
			strRe = string.Empty ;
		return strRe ;
	}

	// ────────────────────────────────────────────────────
	// 取得玩家是否有未領獎項（WIN_AMOUNT > 0 且 PRIZE_WINNER_NO IS NULL）
	// 回傳：_nWinAmount = 未領總額，_bIsGet = 是否已全部領完
	// ────────────────────────────────────────────────────
	public bool GetWinPoint(DateTime _dtNow, out int _nWin)
	{
		// 此活動 WIN_AMOUNT 由排程計算，這裡回傳 0 表示「有無領獎請看 GetWinAmount」
		_nWin = 0 ;
		return true ;
	}

	public bool GetWinAmount(int _nMemberNo, DateTime _dtNow, int _nWin, bool _bNeedGain, out int _nWinAmount, out bool _bIsGet)
	{
		GT_DBAdapter	csWebDBA	= null ;
		GT_DBAdapter	csMemberDBA	= null ;
		GT_DBCommand	csCommand	= null ;
		string			strMemo		= string.Empty ;
		string			strPrizeId	= "2" ;		// ｉ幣
		int				nWinnerNo	= -1 ;
		_nWinAmount					= 0 ;
		_bIsGet						= false ;
		bool	bRe					= false ;

		if (G.COMMON.bIsDemo)
		{
			_nWinAmount = 0 ;
			_bIsGet		= false ;
			return true ;
		}

		csWebDBA	= a_csWS.csDBAManager.CreateDBAdapter() ;
		csMemberDBA	= a_csWS.csDBAManager.CreateDBAdapter() ;

		if (!csWebDBA.Connection("GAMETOWER_WEB") || !csMemberDBA.Connection("GAMETOWER_MEMBER"))
		{
			a_csWS.csTextLogColl["WEB"].WriteLine(csWebDBA.strErrorMessage) ;
			return false ;
		}

		csCommand = csWebDBA.csConn.CreateCommand() ;

		try
		{
			// 查詢玩家所有未領的獎項
			csCommand.CommandText = @"
			SELECT	[MEDAL_COUNT], [WIN_AMOUNT], [PRIZE_WINNER_NO]
			FROM	[" + strActionDB + @"] WITH(NOLOCK)
			WHERE	[MEMBER_NO] = @MEMBER_NO
				AND	[WIN_AMOUNT] > 0" ;

			csCommand.ClearParameters() ;
			csCommand.AddInParameter("@MEMBER_NO", GT_DBType.Int32, _nMemberNo) ;
			strMemo = csCommand.strCommandMessage ;

			using (GT_DBReader csDR = csCommand.ExecuteReader())
			{
				bool bAllClaimed = true ;
				while (csDR.Read())
				{
					int		nMedal		= GT.GetValue(csDR["MEDAL_COUNT"], -1) ;
					int		nAmt		= GT.GetValue(csDR["WIN_AMOUNT"], 0) ;
					bool	bClaimed	= GT.SafeLen(GT.GetValue(csDR["PRIZE_WINNER_NO"])) > 0 ;

					if (!bClaimed)
					{
						_nWinAmount	+= nAmt ;
						bAllClaimed	= false ;
					}
				}
				// 只有全部記錄都已領取才算 _bIsGet
				_bIsGet = bAllClaimed ;
			}

			// 執行領獎
			if (_bNeedGain && _nWinAmount > 0)
			{
				csMemberLocker = new GT_MultiWebsiteLocker(
					GT_LOCKER_MODULE.ACCOUNT,
					Enum.IsDefined(typeof(GT_LOCKER_TEST_ERROR), eTestError.ToString())
						? (GT_LOCKER_TEST_ERROR) Enum.Parse(typeof(GT_LOCKER_TEST_ERROR), eTestError.ToString())
						: GT_LOCKER_TEST_ERROR.NONE) ;
				csMemberLocker.rgstrKeyword.Add(_nMemberNo + "20260611M05") ;

				if (csMemberLocker.Lock(true, 3000))
				{
					if (!a_csPrize.DB_GainPrize(_nMemberNo, a_csPrize.csPrizeDataColl[strPrizeId].nDBAutoNo,
						_nWinAmount, 7, "恭喜獲得猜得分拿獎金獎勵", 22, 0,
						csMemberDBA.csConn, null, out nWinnerNo, out strMemo))
					{
						throw new Exception("會員編號 " + _nMemberNo + " 給獎失敗：ｉ幣 × " + _nWinAmount) ;
					}

					// 記錄領獎編號（批次更新所有未領記錄）
					csCommand.CommandText = @"
					UPDATE	[" + strActionDB + @"]
					SET		[PRIZE_WINNER_NO] = @PRIZE_WINNER_NO
					WHERE	[MEMBER_NO] = @MEMBER_NO
						AND	[WIN_AMOUNT] > 0
						AND	[PRIZE_WINNER_NO] IS NULL" ;

					csCommand.ClearParameters() ;
					csCommand.AddInParameter("@PRIZE_WINNER_NO",	GT_DBType.Int32,	nWinnerNo) ;
					csCommand.AddInParameter("@MEMBER_NO",			GT_DBType.Int32,	_nMemberNo) ;
					strMemo = csCommand.strCommandMessage ;
					csCommand.ExecuteNonQuery() ;

					_bIsGet = true ;

					// 自動領獎
					if (!csAutoDrawList.ContainsKey(_nMemberNo))
						csAutoDrawList.Add(_nMemberNo, new List<int>()) ;
					csAutoDrawList[_nMemberNo].Add(nWinnerNo) ;

					foreach (int nNo in csAutoDrawList.Keys)
					{
						List<int> rgnWinner = csAutoDrawList[nNo] ;
						List<int> rgnPrize  = new List<int>() ;
						foreach (int n in rgnWinner)
							rgnPrize.Add(a_csPrize.csPrizeDataColl[strPrizeId].nDBAutoNo) ;

						if (rgnWinner.Count > 0)
						{
							if (!a_csPrize.BackgroundBatchDrawPrize(nNo, rgnWinner, rgnPrize, csMemberDBA.csConn, out strMemo))
								a_csWS.csTextLogColl["WEB"].WriteLine("自動領獎失敗：" + strMemo) ;
						}
					}

					csMemberLocker.UnLock() ;
				}
				else
				{
					throw new Exception("會員鎖定處理失敗!") ;
				}
			}

			bRe = true ;
		}
		catch (Exception e)
		{
			a_csWS.WriteErrorLog(e, strMemo) ;
		}
		finally
		{
			if (csMemberLocker != null) csMemberLocker.UnLock() ;
			if (csCommand != null)		csCommand.Dispose() ;
			if (csWebDBA != null)		csWebDBA.Dispose() ;
			if (csMemberDBA != null)	csMemberDBA.Close() ;
		}

		return bRe ;
	}

	// ────────────────────────────────────────────────────
	// 取得玩家目前持有的道具數量（依當前開放下注的階段）
	// ────────────────────────────────────────────────────
	public bool GetActionItemCount(GT_WebUser _csWU, DateTime _dtNow, out int _nItemAmount, out bool _bHasPlayGame)
	{
		GT_DBAdapter	csAccountDBA	= a_csWS.csDBAManager.CreateDBAdapter() ;
		GT_DBAdapter	csCasinoDBA		= a_csWS.csDBAManager.CreateDBAdapter() ;
		GT_DBCommand	csCasinoCommand	= null ;
		bool			bRe				= false ;
		string			strMemo			= string.Empty ;

		_nItemAmount	= 0 ;
		_bHasPlayGame	= false ;

		if (G.COMMON.bIsDemo)
		{
			_nItemAmount	= 5000 ;
			_bHasPlayGame	= true ;
			return true ;
		}

		try
		{
			if (csAccountDBA.Connection("GAMETOWER_ACCOUNT_STAR31"))
			{
				using (GT_DBCommand csCmd = new GT_DBCommand(
					"SELECT TOP 1 [NICKNAME] FROM [MEMBER_AccountData] WHERE [INDEX_NO] = @INDEX_NO",
					csAccountDBA.csConn))
				{
					csCmd.AddInParameter("@INDEX_NO", GT_DBType.Int32, _csWU.nMemberNo) ;
					strMemo = "取得玩家帳號：" + csCmd.strCommandMessage ;
					using (GT_DBReader csDR = csCmd.ExecuteReader())
					{
						if (csDR.Read())
							_bHasPlayGame = GT.SafeLen(GT.GetValue(csDR["NICKNAME"])) > 0 ;
					}
				}
			}
			else
			{
				a_csWS.WriteErrorLog(null, csAccountDBA.strErrorMessage) ;
			}

			if (_bHasPlayGame && csCasinoDBA.Connection("GAMETOWER2_GT_CASINO"))
			{
				string strCurrentItemId = GetCurrentItemId(_dtNow) ;

				csCasinoCommand = csCasinoDBA.csConn.CreateCommand() ;
				csCasinoCommand.CommandText = "EXEC WordCollection_WEB_GetPlayerItem @MEMBER_NO, @ITEM_NO" ;
				csCasinoCommand.AddInParameter("@MEMBER_NO", GT_DBType.Int32,  _csWU.nMemberNo) ;
				csCasinoCommand.AddInParameter("@ITEM_NO",   GT_DBType.Int32,  a_csPrize.csPrizeDataColl[strCurrentItemId].nGameItemNo) ;
				strMemo = "取得玩家道具：" + csCasinoCommand.strCommandMessage ;

				using (GT_DBReader csDR = csCasinoCommand.ExecuteReader())
				{
					if (csDR.Read())
						_nItemAmount = GT.GetValue(csDR["Amount"], 0) ;
				}
			}
			else if (!_bHasPlayGame)
			{
				// 無遊戲帳號，略過
			}
			else
			{
				a_csWS.WriteErrorLog(null, csCasinoDBA.strErrorMessage) ;
			}

			bRe = true ;
		}
		catch (Exception e)
		{
			a_csWS.WriteErrorLog(e, strMemo) ;
		}
		finally
		{
			if (csAccountDBA != null)	csAccountDBA.Close() ;
			if (csCasinoDBA != null)	csCasinoDBA.Close() ;
			if (csCasinoCommand != null) csCasinoCommand.Dispose() ;
		}

		return bRe ;
	}

	// ────────────────────────────────────────────────────
	// 取得分組賽各組第一名隊伍
	// key = GROUP_A...GROUP_L，value = TEAM_ID（第一名），無結果則不含此key
	// ────────────────────────────────────────────────────
	public bool GetGroupStageWinners(out Dictionary<string, int> _csWinners)
	{
		GT_DBAdapter	csWebDBA	= null ;
		GT_DBCommand	csCommand	= null ;
		GT_DBReader		csDR		= null ;
		string			strMemo		= string.Empty ;
		bool			bRe			= false ;

		_csWinners = new Dictionary<string, int>() ;

		if (G.COMMON.bIsDemo)
			return true ;

		try
		{
			csWebDBA = a_csWS.csDBAManager.CreateDBAdapter() ;
			if (!csWebDBA.Connection("GAMETOWER_WEB"))
			{
				a_csWS.csTextLogColl["WEB"].WriteLine(csWebDBA.strErrorMessage) ;
				return false ;
			}

			csCommand = csWebDBA.csConn.CreateCommand() ;
			csCommand.CommandText = @"
			SELECT	[GROUP], [TEAM_ID]
			FROM	[GameTower_Web].[dbo].[ACTION_WorldCupGroupStagePosition] WITH(NOLOCK)
			WHERE	[YEAR] = 2026 AND [POSITION] = 1" ;

			strMemo = csCommand.strCommandMessage ;
			csDR    = csCommand.ExecuteReader() ;

			while (csDR.Read())
			{
				string	strGroup	= GT.GetValue(csDR["GROUP"], "") ;
				int		nTeamId		= GT.GetValue(csDR["TEAM_ID"], -1) ;
				if (!string.IsNullOrEmpty(strGroup) && nTeamId > 0)
					_csWinners[strGroup] = nTeamId ;
			}
			csDR.Close() ;

			bRe = true ;
		}
		catch (Exception e)
		{
			a_csWS.WriteErrorLog(e, strMemo) ;
		}
		finally
		{
			if (csDR != null)		csDR.Close() ;
			if (csCommand != null)	csCommand.Dispose() ;
			if (csWebDBA != null)	csWebDBA.Dispose() ;
		}

		return bRe ;
	}

	// ────────────────────────────────────────────────────
	// 取得玩家對所有投注標的的下注統計
	// key = MEDAL_COUNT（投注標的ID）
	// ────────────────────────────────────────────────────
	public bool GetTicketTable(int _nMemberNo, DateTime _dtNow, out Dictionary<int, GT_TicketData> _csTicketDataColl)
	{
		GT_DBAdapter	csWebDBA	= null ;
		GT_DBCommand	csCommand	= null ;
		GT_DBReader		csDR		= null ;
		string			strMemo		= string.Empty ;
		bool			bRe			= false ;

		_csTicketDataColl = new Dictionary<int, GT_TicketData>() ;

		if (G.COMMON.bIsDemo)
		{
			_csTicketDataColl[10769] = new GT_TicketData(10769, 1000, 50, 0, false) ;
			_csTicketDataColl[10774] = new GT_TicketData(10774, 800,  20, 0, false) ;
			return true ;
		}

		csWebDBA = a_csWS.csDBAManager.CreateDBAdapter() ;
		if (!csWebDBA.Connection("GAMETOWER_WEB"))
		{
			a_csWS.csTextLogColl["WEB"].WriteLine(csWebDBA.strErrorMessage) ;
			return false ;
		}

		csCommand = csWebDBA.csConn.CreateCommand() ;

		try
		{
			// 全體各標的投注數
			csCommand.CommandText = @"
			SELECT		[MEDAL_COUNT],
						SUM([TICKET_COUNT]) AS [TOTAL],
						SUM(CASE WHEN [MEMBER_NO] = @MEMBER_NO THEN [TICKET_COUNT] ELSE 0 END) AS [PERSONAL],
						MAX(CASE WHEN [MEMBER_NO] = @MEMBER_NO THEN [WIN_AMOUNT] ELSE 0 END) AS [WIN_AMOUNT],
						MAX(CASE WHEN [MEMBER_NO] = @MEMBER_NO AND [PRIZE_WINNER_NO] IS NOT NULL THEN 1 ELSE 0 END) AS [IS_CLAIMED]
			FROM		[" + strActionDB + @"] WITH(NOLOCK)
			WHERE		[MEMBER_NO] != -1
			GROUP BY	[MEDAL_COUNT]" ;

			csCommand.ClearParameters() ;
			csCommand.AddInParameter("@MEMBER_NO", GT_DBType.Int32, _nMemberNo) ;
			strMemo = csCommand.strCommandMessage ;
			csDR	= csCommand.ExecuteReader() ;

			while (csDR.Read())
			{
				int		nMedal		= GT.GetValue(csDR["MEDAL_COUNT"], -1) ;
				int		nTotal		= GT.GetValue(csDR["TOTAL"],		0) ;
				int		nPersonal	= GT.GetValue(csDR["PERSONAL"],		0) ;
				int		nWinAmt		= GT.GetValue(csDR["WIN_AMOUNT"],	0) ;
				bool	bClaimed	= GT.GetValue(csDR["IS_CLAIMED"],	0) == 1 ;

				if (nMedal >= 0 && !_csTicketDataColl.ContainsKey(nMedal))
					_csTicketDataColl.Add(nMedal, new GT_TicketData(nMedal, nTotal, nPersonal, nWinAmt, bClaimed)) ;
			}
			csDR.Close() ;

			bRe = true ;
		}
		catch (Exception e)
		{
			a_csWS.WriteErrorLog(e, strMemo) ;
		}
		finally
		{
			if (csDR != null)		csDR.Close() ;
			if (csCommand != null)	csCommand.Dispose() ;
			if (csWebDBA != null)	csWebDBA.Dispose() ;
		}

		return bRe ;
	}
</script>
<%
	#region 初始化變數
	bool					bActionInProgress		= false ;

	bool					q_bIngame				= Convert.ToBoolean(GT.GetValue(Request.QueryString["bIngame"], "False")) ;
	bool					q_bDirectStored			= Convert.ToBoolean(GT.GetValue(Request.QueryString["bds"], "False")) ;
	bool					q_bNews					= Convert.ToBoolean(GT.GetValue(Request.QueryString["bNews"], "False")) ;

	int						r_nVip					= 0 ;
	string					r_strNickname			= string.Empty ;
	long					lDiamond				= 0L ;
	long					lIcoin					= 0L ;

	string					strRedirectUrl			= string.Empty ;
	string					strStoreRedirectUrl		= string.Empty ;

	bool					bOverseasIP				= true ;
	bool					bShowPurchaseAlert		= false ;

	int						nItemAmount				= 0 ;
	string					m_strRedirectURL		= Server.UrlEncode(GT.GetRequestAbsoluteUri()) ;
	string					strLoginUrl				= string.Empty ;

	string					strLocation				= GT.GetValue(a_csWS.GetIPAreaCode(GT.GetRemoteIPAddress(), string.Empty), "-") ;

	int						q_nPlatform				= GT.GetValue(Request.QueryString["q_nPlatform"], -1) ;
	bool					bShowStoredButton		= false ;
	bool					bActionItemChecked		= true ;
	bool					bHasPlayGame			= false ;

	GT_StageInfo			csCurrentStage			= null ;	// 目前開放下注的階段
	#endregion

	#region 資料設定
	strLoginUrl = "/mobile/member/login/index.aspx?re=" ;

	if (q_nPlatform < 0)
		q_nPlatform = (int) G.GetUserPlatform() ;

	switch (a_csWS.eEnvironment)
	{
		case GT_ENVIRONMENT.DEVELOP:
			strRedirectUrl = "https://i-371.gt.web/1NQ" ;
			break;
		case GT_ENVIRONMENT.TEST:
			strRedirectUrl = "https://i371-twtest.towergame.com/1NO" ;
			break;
		case GT_ENVIRONMENT.FORMAL:
			strRedirectUrl = "https://i.371.com.tw/1RC" ;
			break;
	}

	csCurrentStage = GetCurrentBetStage(g.dtNow) ;

	if (g.dtNow >= dtActionCoinGainStartDay && g.dtNow < dtActionCoinGainEndDay)
		bActionInProgress = true ;
	#endregion
%>
