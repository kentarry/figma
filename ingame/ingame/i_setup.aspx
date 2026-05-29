<!-- #include virtual="../i_setup.aspx" -->
<%
	// -- 單元根目錄才有下面的設定項目 --
	g_strPageBGColor							= "FFFFFF" ;					// 頁面底色

	g_bCompelSSLEncryptionMode					|= false ;						// [旗標]強制使用加密模式？
	g_bRepairing								|= false ;						// [旗標]維修進行中？

	// -- 單元獨立變數宣告 --
%>
<script language="C#" runat="server">
// 獎項類型
public enum PRIZE_TYPE
{
		POKE = 0,
		BOX,
		CHANCE,
		NORMAL,
}

// 獎項資料
public class GT_PrizeData
{
	public	int					nGrid;			//格子順序
	public	string				strID;			//獎項ID
	public	int					nAmount;		//獎項數量
	public	PRIZE_TYPE			eType;			//獎項類型

	public GT_PrizeData(int _nGrid, string _strID, int _nAmount, PRIZE_TYPE _eType)
	{
			nGrid = _nGrid;
			strID = _strID;
			nAmount = _nAmount;
			eType = _eType;
	}
}
</script>
<%
	// 每個格子獎項。
	List<GT_PrizeData>[]			rgcsPrizeData								= new List<GT_PrizeData>[3]{new List<GT_PrizeData>(),new List<GT_PrizeData>(),new List<GT_PrizeData>()} ;

	// 參數依序為：格子順序、獎項名稱、獎項ID、獎項數量、獎項類型
	rgcsPrizeData[0].Add(new GT_PrizeData(0,	"FREEPLAY_211102_001",		1,			PRIZE_TYPE.BOX));
	rgcsPrizeData[0].Add(new GT_PrizeData(0,	"FREEPLAY_211022_001",		1,			PRIZE_TYPE.BOX));
	rgcsPrizeData[0].Add(new GT_PrizeData(0,	"FREEPLAY_220103_002",		1,			PRIZE_TYPE.BOX));
	rgcsPrizeData[0].Add(new GT_PrizeData(0,	"FREEPLAY_220103_001",		1,			PRIZE_TYPE.BOX));
	rgcsPrizeData[0].Add(new GT_PrizeData(0,	"FREEPLAY_211028_002",		1,			PRIZE_TYPE.BOX));
	rgcsPrizeData[0].Add(new GT_PrizeData(0,	"FREEPLAY_201111_001",		30,			PRIZE_TYPE.BOX));
	rgcsPrizeData[0].Add(new GT_PrizeData(1,	"CASUAL_180124_001",		566,		PRIZE_TYPE.NORMAL));
	rgcsPrizeData[0].Add(new GT_PrizeData(2,	"CASUAL_180124_001",		588,		PRIZE_TYPE.NORMAL));
	rgcsPrizeData[0].Add(new GT_PrizeData(3,	"CASUAL_180124_001",		600,		PRIZE_TYPE.NORMAL));
	rgcsPrizeData[0].Add(new GT_PrizeData(4,	"CASUAL_180124_001",		610,		PRIZE_TYPE.NORMAL));
	rgcsPrizeData[0].Add(new GT_PrizeData(5,	"FREEPLAY_211102_001",		1,			PRIZE_TYPE.BOX));
	rgcsPrizeData[0].Add(new GT_PrizeData(5,	"FREEPLAY_211028_002",		1,			PRIZE_TYPE.BOX));
	rgcsPrizeData[0].Add(new GT_PrizeData(5,	"FREEPLAY_220103_001",		1,			PRIZE_TYPE.BOX));
	rgcsPrizeData[0].Add(new GT_PrizeData(5,	"FREEPLAY_201111_001",		30,			PRIZE_TYPE.BOX));
	rgcsPrizeData[0].Add(new GT_PrizeData(6,	"CASUAL_180124_001",		295,		PRIZE_TYPE.NORMAL));
	rgcsPrizeData[0].Add(new GT_PrizeData(7,	"CASUAL_180124_001",		320,		PRIZE_TYPE.NORMAL));
	rgcsPrizeData[0].Add(new GT_PrizeData(8,	"CASUAL_180124_001",		333,		PRIZE_TYPE.NORMAL));
	rgcsPrizeData[0].Add(new GT_PrizeData(9,	"CASUAL_180124_001",		555,		PRIZE_TYPE.NORMAL));
	rgcsPrizeData[0].Add(new GT_PrizeData(10,	"FREEPLAY_211102_001",		1,			PRIZE_TYPE.BOX));
	rgcsPrizeData[0].Add(new GT_PrizeData(10,	"FREEPLAY_220103_001",		1,			PRIZE_TYPE.BOX));
	rgcsPrizeData[0].Add(new GT_PrizeData(10,	"FREEPLAY_201111_001",		30,			PRIZE_TYPE.BOX));
	rgcsPrizeData[0].Add(new GT_PrizeData(11,	"CASUAL_180124_001",		100,		PRIZE_TYPE.NORMAL));
	rgcsPrizeData[0].Add(new GT_PrizeData(12,	"CASUAL_180124_001",		166,		PRIZE_TYPE.NORMAL));
	rgcsPrizeData[0].Add(new GT_PrizeData(13,	"CASUAL_180124_001",		180,		PRIZE_TYPE.NORMAL));
	rgcsPrizeData[0].Add(new GT_PrizeData(14,	"CASUAL_180124_001",		260,		PRIZE_TYPE.NORMAL));

	rgcsPrizeData[1].Add(new GT_PrizeData(5,	"FREEPLAY_211102_001",		1,			PRIZE_TYPE.BOX));
	rgcsPrizeData[1].Add(new GT_PrizeData(5,	"FREEPLAY_211028_002",		1,			PRIZE_TYPE.BOX));
	rgcsPrizeData[1].Add(new GT_PrizeData(5,	"FREEPLAY_220103_001",		1,			PRIZE_TYPE.BOX));
	rgcsPrizeData[1].Add(new GT_PrizeData(5,	"FREEPLAY_201111_001",		10,			PRIZE_TYPE.BOX));
	rgcsPrizeData[1].Add(new GT_PrizeData(6,	"CASUAL_180124_001",		88,			PRIZE_TYPE.NORMAL));
	rgcsPrizeData[1].Add(new GT_PrizeData(7,	"CASUAL_180124_001",		95,			PRIZE_TYPE.NORMAL));
	rgcsPrizeData[1].Add(new GT_PrizeData(8,	"CASUAL_180124_001",		100,		PRIZE_TYPE.NORMAL));
	rgcsPrizeData[1].Add(new GT_PrizeData(9,	"CASUAL_180124_001",		166,		PRIZE_TYPE.NORMAL));
	rgcsPrizeData[1].Add(new GT_PrizeData(10,	"FREEPLAY_211102_001",		1,			PRIZE_TYPE.BOX));
	rgcsPrizeData[1].Add(new GT_PrizeData(10,	"FREEPLAY_220103_001",		1,			PRIZE_TYPE.BOX));
	rgcsPrizeData[1].Add(new GT_PrizeData(10,	"FREEPLAY_201111_001",		10,			PRIZE_TYPE.BOX));
	rgcsPrizeData[1].Add(new GT_PrizeData(11,	"CASUAL_180124_001",		30,			PRIZE_TYPE.NORMAL));
	rgcsPrizeData[1].Add(new GT_PrizeData(12,	"CASUAL_180124_001",		48,			PRIZE_TYPE.NORMAL));
	rgcsPrizeData[1].Add(new GT_PrizeData(13,	"CASUAL_180124_001",		54,			PRIZE_TYPE.NORMAL));
	rgcsPrizeData[1].Add(new GT_PrizeData(14,	"CASUAL_180124_001",		78,			PRIZE_TYPE.NORMAL));

	rgcsPrizeData[2].Add(new GT_PrizeData(10,	"FREEPLAY_211102_001",		1,			PRIZE_TYPE.BOX));
	rgcsPrizeData[2].Add(new GT_PrizeData(10,	"FREEPLAY_220103_001",		1,			PRIZE_TYPE.BOX));
	rgcsPrizeData[2].Add(new GT_PrizeData(10,	"FREEPLAY_201111_001",		3,			PRIZE_TYPE.BOX));
	rgcsPrizeData[2].Add(new GT_PrizeData(11,	"CASUAL_180124_001",		10,			PRIZE_TYPE.NORMAL));
	rgcsPrizeData[2].Add(new GT_PrizeData(12,	"CASUAL_180124_001",		16,			PRIZE_TYPE.NORMAL));
	rgcsPrizeData[2].Add(new GT_PrizeData(13,	"CASUAL_180124_001",		18,			PRIZE_TYPE.NORMAL));
	rgcsPrizeData[2].Add(new GT_PrizeData(14,	"CASUAL_180124_001",		26,			PRIZE_TYPE.NORMAL));

%>