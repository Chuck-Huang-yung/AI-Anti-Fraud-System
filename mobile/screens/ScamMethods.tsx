import { useNavigation } from "@react-navigation/native";
import * as Sharing from "expo-sharing";
import * as Clipboard from "expo-clipboard";
import React, { useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  Animated,
  Dimensions,
  Image,
  Linking,
  Modal,
  PanResponder,
  Platform,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { captureRef } from "react-native-view-shot";

const SCREEN_WIDTH = Dimensions.get("window").width;
const SWIPE_THRESHOLD = 0.25 * SCREEN_WIDTH;
const SWIPE_OUT_DURATION = 250;
const API_URL = "https://02f9-220-130-167-166.ngrok-free.app";

// ==========================================
// 🌟 核心解法：全域進度快取 (Global Cache)
// ==========================================
let globalQuizPool: any[] = [];
let globalDeck: any[] = [];
let globalCurrentIndex = 0;
let globalScore = 0;
let globalIsQuizFinished = false;
let globalShowResult = false;
let globalIsAnswerCorrect = false;
let globalCategoryMistakes: Record<string, number> = {};

// 🌟 新增：如果是在網頁/LINE瀏覽器中，嘗試從分頁暫存恢復上一頁的記憶
if (Platform.OS === "web" && typeof sessionStorage !== "undefined") {
  const savedDeck = sessionStorage.getItem("scam_deck");
  if (savedDeck) {
    globalDeck = JSON.parse(savedDeck);
    globalCurrentIndex = Number(sessionStorage.getItem("scam_index") || 0);
    globalScore = Number(sessionStorage.getItem("scam_score") || 0);
    globalIsQuizFinished = sessionStorage.getItem("scam_finished") === "true";
    globalShowResult = sessionStorage.getItem("scam_showResult") === "true";
    globalIsAnswerCorrect = sessionStorage.getItem("scam_correct") === "true";

    const savedMistakes = sessionStorage.getItem("scam_mistakes");
    if (savedMistakes) {
      globalCategoryMistakes = JSON.parse(savedMistakes);
    }
  }
}

export default function ScamMethods() {
  const navigation = useNavigation();
  const shareCardRef = useRef<View>(null);

  // 🌟 初始化時，優先讀取全域快取的進度
  const [quizPool, setQuizPool] = useState<any[]>(globalQuizPool);
  const [loading, setLoading] = useState(globalDeck.length === 0);

  const [deck, setDeck] = useState<any[]>(globalDeck);
  const [currentIndex, setCurrentIndex] = useState(globalCurrentIndex);
  const [showResult, setShowResult] = useState(globalShowResult);
  const [isAnswerCorrect, setIsAnswerCorrect] = useState(globalIsAnswerCorrect);
  const [score, setScore] = useState(globalScore);
  const [categoryMistakes, setCategoryMistakes] = useState<
    Record<string, number>
  >(globalCategoryMistakes);

  const [shareImageUri, setShareImageUri] = useState<string | null>(null);
  const [shareModalVisible, setShareModalVisible] = useState(false);
  const [isQuizFinished, setIsQuizFinished] = useState(globalIsQuizFinished);
  const [isCapturing, setIsCapturing] = useState(false);

  const [toastVisible, setToastVisible] = useState(false);
  const [toastMessage, setToastMessage] = useState("");

  const showToast = (msg: string) => {
    setToastMessage(msg);
    setToastVisible(true);
    setTimeout(() => {
      setToastVisible(false);
    }, 2000);
  };

  const [alertVisible, setAlertVisible] = useState(false);
  const [alertText, setAlertText] = useState("");
  const [alertBtnLabel, setAlertBtnLabel] = useState("確定");

  const triggerAlert = (msg: string, btnLabel?: string) => {
    setAlertText(msg);
    setAlertBtnLabel(btnLabel || "我知道了");
    setAlertVisible(true);
  };

  const stateRef = useRef({ deck: [] as any[], currentIndex: 0 });

  useEffect(() => {
    stateRef.current = { deck, currentIndex };
  }, [deck, currentIndex]);

  // 🌟 自動同步進度到全域快取與網頁暫存
  useEffect(() => {
    globalQuizPool = quizPool;
    globalDeck = deck;
    globalCurrentIndex = currentIndex;
    globalScore = score;
    globalIsQuizFinished = isQuizFinished;
    globalShowResult = showResult;
    globalIsAnswerCorrect = isAnswerCorrect;
    globalCategoryMistakes = categoryMistakes;

    // 🌟 新增：只要進度有變，就立刻寫入瀏覽器暫存！
    if (Platform.OS === "web" && typeof sessionStorage !== "undefined") {
      sessionStorage.setItem("scam_deck", JSON.stringify(deck));
      sessionStorage.setItem("scam_index", currentIndex.toString());
      sessionStorage.setItem("scam_score", score.toString());
      sessionStorage.setItem("scam_finished", isQuizFinished.toString());
      sessionStorage.setItem("scam_showResult", showResult.toString());
      sessionStorage.setItem("scam_correct", isAnswerCorrect.toString());
      sessionStorage.setItem("scam_mistakes", JSON.stringify(categoryMistakes));
    }
  }, [
    quizPool,
    deck,
    currentIndex,
    score,
    isQuizFinished,
    showResult,
    isAnswerCorrect,
    categoryMistakes,
  ]);

  const position = useRef(new Animated.ValueXY()).current;

  const panResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => false,
      onMoveShouldSetPanResponder: (evt, gestureState) => {
        return Math.abs(gestureState.dx) > 5 || Math.abs(gestureState.dy) > 5;
      },
      onPanResponderMove: (event, gesture) => {
        position.setValue({ x: gesture.dx, y: gesture.dy });
      },
      onPanResponderRelease: (event, gesture) => {
        if (gesture.dx > SWIPE_THRESHOLD) {
          forceSwipe("right");
        } else if (gesture.dx < -SWIPE_THRESHOLD) {
          forceSwipe("left");
        } else {
          resetPosition();
        }
      },
    }),
  ).current;

  const forceSwipe = (direction: "left" | "right") => {
    const x = direction === "right" ? SCREEN_WIDTH * 1.5 : -SCREEN_WIDTH * 1.5;
    Animated.timing(position, {
      toValue: { x, y: 0 },
      duration: SWIPE_OUT_DURATION,
      useNativeDriver: false,
    }).start(() => onSwipeComplete(direction));
  };

  const onSwipeComplete = (direction: "left" | "right") => {
    const currentDeck = stateRef.current.deck;
    const currIdx = stateRef.current.currentIndex;
    const currentCard = currentDeck[currIdx];

    if (!currentCard) return;

    const isGuessingTrue = direction === "right";
    const cardTrueValue =
      String(currentCard.isTrue).trim().toLowerCase() === "true" ||
      currentCard.isTrue === 1 ||
      currentCard.isTrue === true;

    const correct = cardTrueValue === isGuessingTrue;

    if (correct) {
      setScore((prev) => prev + 1);
    } else {
      // 🌟 新增：如果答錯了，就把這題的 category 記上一筆！
      setCategoryMistakes((prev) => {
        const cat = currentCard.category || "未分類";
        return {
          ...prev,
          [cat]: (prev[cat] || 0) + 1,
        };
      });
    }

    setIsAnswerCorrect(correct);
    setShowResult(true);
  };

  const resetPosition = () => {
    Animated.spring(position, {
      toValue: { x: 0, y: 0 },
      useNativeDriver: false,
    }).start();
  };

  const getCardStyle = () => {
    const rotate = position.x.interpolate({
      inputRange: [-SCREEN_WIDTH * 1.5, 0, SCREEN_WIDTH * 1.5],
      outputRange: ["-25deg", "0deg", "25deg"],
    });

    return {
      ...position.getLayout(),
      transform: [{ rotate }],
    };
  };

  useEffect(() => {
    // 🌟 如果全域快取裡面已經有題目了，就直接跳過抓取，不再轉圈圈！
    if (globalDeck.length > 0) {
      setLoading(false);
      return;
    }

    const fetchQuizPoolFromDB = async () => {
      try {
        setLoading(true);
        const response = await fetch(`${API_URL}/api/quiz`, {
          method: "GET",
          headers: {
            "Content-Type": "application/json",
            "ngrok-skip-browser-warning": "true",
            "Bypass-Tunnel-Reminder": "true",
          },
        });

        if (!response.ok) {
          throw new Error(`狀態碼: ${response.status}`);
        }

        const data = await response.json();
        const formattedData = data.map((item: any) => ({
          category: item.category,
          title: item.title,
          hint: item.hint,
          isTrue: item.is_true ?? item.isTrue,
          details: item.details,
          link: item.link,
        }));

        setQuizPool(formattedData);
        const shuffled = [...formattedData]
          .sort(() => 0.5 - Math.random())
          .slice(0, 10);
        setDeck(shuffled);
      } catch (error) {
        setQuizPool([]);
        setDeck([]);
      } finally {
        setLoading(false);
      }
    };

    fetchQuizPoolFromDB();
  }, []);

  const generateDeck = () => {
    if (quizPool.length === 0) return;
    const shuffled = [...quizPool].sort(() => 0.5 - Math.random()).slice(0, 10);
    setDeck(shuffled);
    setCurrentIndex(0);
    setScore(0);
    setShowResult(false);
    setIsQuizFinished(false);
    setCategoryMistakes({});
    position.setValue({ x: 0, y: 0 });
  };

  const nextCard = () => {
    if (currentIndex < deck.length - 1) {
      setCurrentIndex(currentIndex + 1);
      setShowResult(false);
      position.setValue({ x: 0, y: 0 });
    } else {
      setIsQuizFinished(true);
    }
  };

  const handleOpenLink = async (url: string) => {
    if (!url) return;
    if (Platform.OS === "web") {
      window.open(url, "_blank");
    } else {
      try {
        await Linking.openURL(url);
      } catch (error) {
        console.log("無法開啟超連結:", error);
      }
    }
  };

  const getWeaknessAnalysis = () => {
    if (Object.keys(categoryMistakes).length === 0) {
      return "太厲害了！您的防護力毫無死角！💯";
    }

    let maxMistakes = 0;
    let weakestCategory = "";
    for (const [category, count] of Object.entries(categoryMistakes)) {
      if (count > maxMistakes) {
        maxMistakes = count;
        weakestCategory = category;
      }
    }

    return `💡 弱點分析：您在「${weakestCategory}」類型的題目最容易被騙（錯了 ${maxMistakes} 題），建議多加留意！`;
  };

  // 🌟 終極大絕招：Canvas 巨量字體 + 暴力拆分絕對置中版 (完全無更動)
  const handleShareResult = async () => {
    setShareImageUri(null);
    setIsCapturing(true);
    setShareModalVisible(true);

    if (Platform.OS === "web") {
      try {
        const canvas = document.createElement("canvas");
        const ctx = canvas.getContext("2d");
        if (!ctx) throw new Error("不支援 Canvas");

        canvas.width = 720;
        canvas.height = 1040;
        const centerX = canvas.width / 2;

        const drawRoundRect = (
          x: number,
          y: number,
          w: number,
          h: number,
          r: number,
        ) => {
          ctx.beginPath();
          ctx.moveTo(x + r, y);
          ctx.lineTo(x + w - r, y);
          ctx.quadraticCurveTo(x + w, y, x + w, y + r);
          ctx.lineTo(x + w, y + h - r);
          ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
          ctx.lineTo(x + r, y + h);
          ctx.quadraticCurveTo(x, y + h, x, y + h - r);
          ctx.lineTo(x, y + r);
          ctx.quadraticCurveTo(x, y, x + r, y);
          ctx.closePath();
        };

        const fontStack =
          "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif, 'Apple Color Emoji', 'Segoe UI Emoji'";

        // 1. 底色
        ctx.fillStyle = "#faf6f0";
        ctx.fillRect(0, 0, canvas.width, canvas.height);

        // 2. 外層可可棕框
        ctx.lineWidth = 14;
        ctx.strokeStyle = "#4a3b32";
        drawRoundRect(24, 24, 672, 992, 32);
        ctx.stroke();

        // 3. 內層反光細框
        ctx.lineWidth = 4;
        ctx.strokeStyle = "#d9c9bc";
        drawRoundRect(42, 42, 636, 956, 22);
        ctx.stroke();

        // 4. 上方 Badge 膠囊
        ctx.fillStyle = "#c85a32";
        drawRoundRect(200, 80, 320, 56, 28);
        ctx.fill();

        // 🌟 核心修復：拆分 Emoji 與文字，絕對手動置中！
        ctx.textBaseline = "middle";
        ctx.font = `900 28px ${fontStack}`;
        ctx.fillStyle = "#ffffff";
        ctx.textAlign = "left";

        const badgeText = "官方題庫認證";
        const badgeTextWidth = ctx.measureText(badgeText).width;
        const emojiSpace = 38;
        const totalBadgeWidth = emojiSpace + badgeTextWidth;
        const badgeStartX = centerX - totalBadgeWidth / 2;

        ctx.fillText("🛡️", badgeStartX, 108);
        ctx.fillText(badgeText, badgeStartX + emojiSpace, 108);

        // 5. 標題
        ctx.textAlign = "center";
        ctx.font = `900 40px ${fontStack}`;
        ctx.fillStyle = "#4a3b32";
        ctx.fillText("真識監詐 · 家庭防護測驗", centerX, 195);

        // 6. 白底內部卡片
        ctx.fillStyle = "#ffffff";
        drawRoundRect(60, 250, 600, 580, 24);
        ctx.fill();
        ctx.lineWidth = 2;
        ctx.strokeStyle = "#e8ded4";
        ctx.stroke();

        // 7. 內部 Emoji
        ctx.textAlign = "center";
        ctx.font = `85px ${fontStack}`;
        ctx.fillText("☕🏆✨", centerX, 350);

        // 8. 分數標籤
        ctx.font = `900 36px ${fontStack}`;
        ctx.fillStyle = "#8c6b58";
        ctx.fillText("防詐守護指數", centerX, 450);

        // 9. 巨大化霸氣分數
        ctx.font = `900 120px ${fontStack}`;
        ctx.fillStyle = "#c85a32";
        ctx.fillText(`${score * 10} 分`, centerX, 580);

        // 10. 兩行副標題
        ctx.font = `900 28px ${fontStack}`;
        ctx.fillStyle = "#5c4738";
        ctx.fillText(`已成功抵禦 ${score} / 10 題時事詐騙陷阱！`, centerX, 730);
        ctx.fillText("快來測試你家長輩的防詐識破能力！", centerX, 780);

        // 11. 底部推廣 Footer 膠囊
        ctx.fillStyle = "#f3e8df";
        drawRoundRect(60, 870, 600, 110, 24);
        ctx.fill();

        // 12. 網址換行
        ctx.font = `900 26px ${fontStack}`;
        ctx.fillStyle = "#5c4738";
        ctx.textAlign = "left";

        const footerText = "立即掃描或點擊挑戰：";
        const footerTextWidth = ctx.measureText(footerText).width;
        const footerEmojiSpace = 32;
        const footerTotalWidth = footerEmojiSpace + footerTextWidth;
        const footerStartX = centerX - footerTotalWidth / 2;

        ctx.fillText("👉", footerStartX, 910);
        ctx.fillText(footerText, footerStartX + footerEmojiSpace, 910);

        ctx.textAlign = "center";
        ctx.font = `900 24px ${fontStack}`;
        ctx.fillStyle = "#8c6b58";
        ctx.fillText("https://news.fraudchickenbye.com/", centerX, 955);

        // 13. 輸出圖片
        const dataUri = canvas.toDataURL("image/png");
        setShareImageUri(dataUri);
        setIsCapturing(false);
      } catch (err) {
        console.error("Canvas 產生失敗:", err);
        setIsCapturing(false);
        showToast("📸 圖片生成失敗，請使用手機截圖！");
      }
    } else {
      // 📱 App 原生版保留套件截圖
      setTimeout(async () => {
        try {
          if (shareCardRef.current) {
            const uri = await captureRef(shareCardRef, {
              format: "png",
              quality: 1.0,
              result: "tmpfile",
            });
            setShareImageUri(uri);
            setIsCapturing(false);
          }
        } catch (error) {
          console.log("App 截圖失敗", error);
          setIsCapturing(false);
        }
      }, 400);
    }
  };

  return (
    <SafeAreaView style={styles.safe}>
      <View style={styles.header}>
        <TouchableOpacity
          onPress={() => navigation.goBack()}
          style={styles.backButton}
        >
          <Text style={styles.backText}>‹ 返回</Text>
        </TouchableOpacity>
        <Text style={styles.headerTitle}>1. 基本手法挑戰</Text>
        <View style={styles.placeholder} />
      </View>

      {loading ? (
        <View style={[styles.container, { justifyContent: "center" }]}>
          <Image
            source={require("../assets/loading.gif")}
            style={{ width: 120, height: 120, marginBottom: 16 }}
            resizeMode="contain"
          />
          <Text style={styles.loadingText}>正在從雲端準備考題...</Text>
        </View>
      ) : deck.length === 0 ? (
        <View style={[styles.container, { justifyContent: "center" }]}>
          <Text style={styles.errorText}>⚠️ 無法從資料庫取得真實考題！</Text>
        </View>
      ) : (
        <View style={styles.container}>
          <View style={{ alignItems: "center", marginBottom: 12 }}>
            <Text style={styles.progressText}>
              進度：{isQuizFinished ? 10 : currentIndex + 1} / {deck.length}
            </Text>
            <View style={styles.bannerBox}>
              <Text style={styles.bannerText}>
                🎲 本次測驗由「真識監詐」題庫隨機抽取
                <Text style={styles.highlightText}>實際案例</Text>
                出題做測試，來看看您懂多少吧！
              </Text>
            </View>
          </View>

          {isQuizFinished ? (
            <View style={styles.resultCard}>
              <View style={styles.scoreContainer}>
                <Text style={styles.scoreEmoji}>☕🏆</Text>
                <Text style={styles.scoreTitle}>防詐挑戰完成！</Text>
                <Text style={styles.scoreText}>
                  您的家庭守護指數：
                  <Text style={styles.scoreHighlight}>{score * 10}</Text> 分
                </Text>
                <Text style={styles.scoreSub}>
                  成功答對了 {score} / 10 題，快把測驗分享給其他人吧！
                </Text>

                {/* 🟢 新增的弱點分析小看板 */}
                <View
                  style={{
                    backgroundColor: "#f3e8df",
                    padding: 12,
                    borderRadius: 10,
                    width: "100%",
                    marginBottom: 20,
                  }}
                >
                  <Text
                    style={{
                      fontSize: 13,
                      color: "#5c4738",
                      fontWeight: "700",
                      textAlign: "center",
                      lineHeight: 20,
                    }}
                  >
                    {getWeaknessAnalysis()}
                  </Text>
                </View>

                <TouchableOpacity
                  style={styles.shareLargeBtn}
                  onPress={handleShareResult}
                  activeOpacity={0.8}
                >
                  <Text style={styles.shareBtnText}>生成專屬證書卡片分享</Text>
                </TouchableOpacity>

                <TouchableOpacity
                  style={styles.refreshLargeBtn}
                  onPress={generateDeck}
                  activeOpacity={0.8}
                >
                  <Text style={styles.refreshBtnText}>重新嘗試新題目</Text>
                </TouchableOpacity>
              </View>
            </View>
          ) : showResult ? (
            <View style={styles.resultCard}>
              <ScrollView
                contentContainerStyle={styles.resultScroll}
                showsVerticalScrollIndicator={false}
              >
                <Text
                  style={
                    isAnswerCorrect ? styles.resultCorrect : styles.resultWrong
                  }
                >
                  {isAnswerCorrect
                    ? "🎉 判斷完全正確！"
                    : "💥 哎呀，判斷錯誤！"}
                </Text>

                <Text style={styles.detailsTitle}>
                  {deck[currentIndex].details}
                </Text>

                <TouchableOpacity
                  style={styles.linkBox}
                  onPress={() => handleOpenLink(deck[currentIndex].link)}
                  activeOpacity={0.7}
                >
                  <Text style={styles.linkLabel}>
                    📰 原始時事新聞查核直達連結（點擊前往）：
                  </Text>
                  <Text style={styles.linkText} numberOfLines={1}>
                    {deck[currentIndex].link}
                  </Text>
                </TouchableOpacity>

                <TouchableOpacity style={styles.nextBtn} onPress={nextCard}>
                  <Text style={styles.nextBtnText}>
                    {currentIndex === deck.length - 1
                      ? "查看最終成果"
                      : "下一題"}
                  </Text>
                </TouchableOpacity>

                <TouchableOpacity
                  style={styles.refreshSmallBtn}
                  onPress={generateDeck}
                >
                  <Text style={styles.refreshSmallText}>刷新題目重新開始</Text>
                </TouchableOpacity>
              </ScrollView>
            </View>
          ) : (
            <Animated.View
              key={currentIndex}
              style={[styles.card, getCardStyle()]}
              {...panResponder.panHandlers}
            >
              <View style={styles.cardContent}>
                <View style={styles.cardHeader}>
                  <Text style={styles.categoryTag}>
                    {deck[currentIndex].category}
                  </Text>
                </View>

                <Text style={styles.cardTitle}>{deck[currentIndex].title}</Text>
                <Text style={styles.vsText}>
                  搭配以下實際情境，您覺得正確嗎？
                </Text>

                <View style={styles.hintBox}>
                  <ScrollView showsVerticalScrollIndicator={false}>
                    <Text style={styles.hintText}>
                      "{deck[currentIndex].hint}"
                    </Text>
                  </ScrollView>
                </View>
              </View>

              <View style={styles.cardBottomBar}>
                <TouchableOpacity
                  style={[styles.actionBtn, styles.btnCross]}
                  onPress={() => forceSwipe("left")}
                >
                  <Text style={[styles.actionIcon, { color: "#d9534f" }]}>
                    錯誤
                  </Text>
                </TouchableOpacity>

                <TouchableOpacity
                  style={[styles.actionBtn, styles.btnCheck]}
                  onPress={() => forceSwipe("right")}
                >
                  <Text style={[styles.actionIcon, { color: "#689f38" }]}>
                    正確
                  </Text>
                </TouchableOpacity>
              </View>
            </Animated.View>
          )}
        </View>
      )}

      {/* 🌟 證書顯示彈窗 */}
      <Modal
        animationType="slide"
        transparent={true}
        visible={shareModalVisible}
        onRequestClose={() => setShareModalVisible(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>分享防詐挑戰成果</Text>
              <TouchableOpacity onPress={() => setShareModalVisible(false)}>
                <Text style={styles.modalCloseText}>✕</Text>
              </TouchableOpacity>
            </View>

            {isCapturing || !shareImageUri ? (
              <View
                style={styles.shareCardOuter}
                ref={shareCardRef}
                collapsable={false}
              >
                <View style={styles.shareCardInner}>
                  <View style={styles.shareCardHeader}>
                    <Text style={styles.shareCardBadge}>🛡️ 官方題庫認證</Text>
                    <Text style={styles.shareCardTitle}>
                      真識監詐 · 家庭防護測驗
                    </Text>
                  </View>
                  <View style={styles.shareCardBody}>
                    <Text style={styles.shareCardEmoji}>☕🏆✨</Text>
                    <Text style={styles.shareCardScoreLabel}>防詐守護指數</Text>
                    <Text style={styles.shareCardScoreValue}>
                      {score * 10} 分
                    </Text>
                    <Text style={styles.shareCardSubText}>
                      已成功抵禦 {score} / 10 題時事詐騙陷阱！{"\n"}
                      快來測試你家長輩的防詐識破能力！
                    </Text>
                  </View>
                  <View style={styles.shareCardFooter}>
                    <Text style={styles.shareCardFooterText}>
                      👉 立即掃描或點擊挑戰：{"\n"}
                      https://news.fraudchickenbye.com/
                    </Text>
                  </View>
                </View>
              </View>
            ) : (
              <Image
                source={{ uri: shareImageUri }}
                style={styles.previewImage}
                resizeMode="contain"
              />
            )}

            <View style={styles.modalActionRow}>
              <TouchableOpacity
                style={styles.modalBtn}
                onPress={() => {
                  setTimeout(() => {
                    triggerAlert("請「長按」圖片進行儲存、分享照片!");
                  }, 400);
                }}
              >
                <Text style={styles.modalBtnIcon}>📥</Text>
                <Text style={styles.modalBtnText}>儲存圖卡</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={styles.modalBtn}
                onPress={async () => {
                  try {
                    await Clipboard.setStringAsync(
                      `我剛獲得了 ${score * 10} 分的防詐指數！快來測驗您的防禦力！\nhttps://news.fraudchickenbye.com/`,
                    );
                    setShareModalVisible(false);
                    setTimeout(
                      () => showToast("✅ 連結複製成功！快去分享吧"),
                      300,
                    );
                  } catch (err) {
                    showToast("❌ 複製失敗，請手動複製網址");
                  }
                }}
              >
                <Text style={styles.modalBtnIcon}>🔗</Text>
                <Text style={styles.modalBtnText}>複製挑戰連結</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* 🌟 咖啡杯「溫馨提示」彈跳視窗 */}
      <Modal
        animationType="fade"
        transparent={true}
        visible={alertVisible}
        onRequestClose={() => setAlertVisible(false)}
      >
        <View style={styles.alertOverlay}>
          <View style={styles.alertBox}>
            <Text style={styles.alertIcon}>☕</Text>
            <Text style={styles.alertTitle}>溫馨提示</Text>
            <Text style={styles.alertMessage}>{alertText}</Text>

            <TouchableOpacity
              style={styles.alertButton}
              onPress={() => {
                setAlertVisible(false);
              }}
              activeOpacity={0.8}
            >
              <Text style={styles.alertButtonText}>{alertBtnLabel}</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      {toastVisible && (
        <View style={styles.toastContainer}>
          <Text style={styles.toastText}>{toastMessage}</Text>
        </View>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: "#fcfaf7" },
  header: {
    height: 56,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    borderBottomWidth: 1,
    borderBottomColor: "#ede5dc",
    backgroundColor: "#fcfaf7",
    paddingHorizontal: 16,
  },
  backButton: { paddingVertical: 8, width: 60, justifyContent: "center" },
  placeholder: { width: 60 },
  backText: { fontSize: 16, color: "#8c6b58", fontWeight: "700" },
  headerTitle: {
    fontSize: 18,
    fontWeight: "900",
    color: "#4a3b32",
    textAlign: "center",
    flex: 1,
  },
  loadingText: {
    marginTop: 14,
    fontSize: 16,
    fontWeight: "700",
    color: "#8c6b58",
  },
  errorText: {
    fontSize: 16,
    fontWeight: "700",
    color: "#c85a32",
    textAlign: "center",
    lineHeight: 24,
  },
  container: {
    flex: 1,
    padding: 14,
    // 🌟 修改 1：加上頂部間距，並把 justifyContent 從 center 改為 flex-start，讓整個區塊優雅上移
    paddingTop: 32,
    alignItems: "center",
    justifyContent: "flex-start",
    backgroundColor: "#faf6f0",
  },
  progressText: {
    fontSize: 13,
    color: "#8c6b58",
    fontWeight: "800",
    marginBottom: 6,
  },
  bannerBox: {
    backgroundColor: "#f3e8df",
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#e6d7c8",
    maxWidth: "96%",
  },
  bannerText: {
    fontSize: 12,
    color: "#5c4738",
    fontWeight: "700",
    textAlign: "center",
    lineHeight: 20,
  },
  highlightText: {
    color: "#c85a32",
    fontWeight: "900",
    textDecorationLine: "underline",
  },
  card: {
    width: "100%",
    height: 480,
    // 🌟 修改 2：移除外層卡片的 backgroundColor，避免在底部圓角處產生抗鋸齒漏色白邊
    borderRadius: 20,
    borderWidth: 1,
    borderColor: "#e8ded4",
    overflow: "hidden",
    justifyContent: "space-between",
    ...Platform.select({
      web: { boxShadow: "0px 8px 24px rgba(74, 59, 50, 0.06)" },
      default: {
        shadowColor: "#4a3b32",
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.08,
        shadowRadius: 10,
        elevation: 4,
      },
    }),
  },
  cardContent: {
    // 🌟 修改 3：將白底移到內部區塊，確保白色只存在該存在的地方
    backgroundColor: "#ffffff",
    padding: 18,
    flex: 1,
    justifyContent: "center",
  },
  cardHeader: { alignItems: "center", marginBottom: 12 },
  categoryTag: {
    backgroundColor: "#f5ebe0",
    color: "#8c6b58",
    paddingHorizontal: 12,
    paddingVertical: 4,
    borderRadius: 12,
    fontSize: 12,
    fontWeight: "800",
    overflow: "hidden",
  },
  cardTitle: {
    fontSize: 19,
    fontWeight: "900",
    color: "#4a3b32",
    textAlign: "center",
    marginBottom: 6,
  },
  vsText: {
    fontSize: 13,
    fontWeight: "700",
    color: "#9c8474",
    textAlign: "center",
    marginBottom: 14,
  },
  hintBox: {
    backgroundColor: "#fcfaf7",
    padding: 14,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#f0e6dc",
    flex: 1,
    maxHeight: 220,
  },
  hintText: {
    fontSize: 15,
    fontWeight: "700",
    color: "#5c4738",
    lineHeight: 24,
    textAlign: "justify",
  },
  cardBottomBar: {
    height: 80,
    backgroundColor: "#4a3b32",
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-evenly",
    paddingHorizontal: 16,
    // 🌟 修改 4：強迫底部邊緣自帶貼合的圓角，並加上極微小的負邊距完美吃掉那 1px 白邊
    borderBottomLeftRadius: 19,
    borderBottomRightRadius: 19,
    marginHorizontal: -1,
    marginBottom: -1,
  },
  actionBtn: {
    width: 52,
    height: 52,
    borderRadius: 26,
    backgroundColor: "#5c4738",
    justifyContent: "center",
    alignItems: "center",
  },
  btnCross: { borderWidth: 2.5, borderColor: "#d9534f" },
  btnCheck: { borderWidth: 2.5, borderColor: "#689f38" },
  actionIcon: { fontSize: 17, fontWeight: "800" },
  resultCard: {
    width: "100%",
    height: 480,
    backgroundColor: "#ffffff",
    borderRadius: 20,
    borderWidth: 1,
    borderColor: "#e8ded4",
    overflow: "hidden",
    ...Platform.select({
      web: { boxShadow: "0px 8px 24px rgba(74, 59, 50, 0.06)" },
      default: {
        shadowColor: "#4a3b32",
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.08,
        shadowRadius: 10,
        elevation: 4,
      },
    }),
  },
  resultScroll: { padding: 22, flexGrow: 1, justifyContent: "center" },
  resultCorrect: {
    fontSize: 22,
    fontWeight: "900",
    color: "#689f38",
    textAlign: "center",
    marginBottom: 12,
  },
  resultWrong: {
    fontSize: 22,
    fontWeight: "900",
    color: "#d9534f",
    textAlign: "center",
    marginBottom: 12,
  },
  detailsTitle: {
    fontSize: 14,
    fontWeight: "700",
    color: "#5c4738",
    marginBottom: 16,
    textAlign: "justify",
    lineHeight: 22,
    backgroundColor: "#fcfaf7",
    padding: 14,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: "#f0e6dc",
  },
  linkBox: {
    backgroundColor: "#fcfaf7",
    padding: 12,
    borderRadius: 10,
    marginBottom: 18,
    borderWidth: 1,
    borderColor: "#ede5dc",
  },
  linkLabel: {
    fontSize: 11,
    fontWeight: "800",
    color: "#c85a32",
    marginBottom: 4,
  },
  linkText: {
    fontSize: 11,
    color: "#8c6b58",
    fontWeight: "700",
    textDecorationLine: "underline",
  },
  nextBtn: {
    backgroundColor: "#4a3b32",
    paddingVertical: 14,
    borderRadius: 12,
    alignItems: "center",
  },
  nextBtnText: { color: "#ffffff", fontSize: 15, fontWeight: "800" },
  scoreContainer: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    padding: 24,
  },
  scoreEmoji: { fontSize: 52, marginBottom: 10 },
  scoreTitle: {
    fontSize: 22,
    fontWeight: "900",
    color: "#4a3b32",
    marginBottom: 12,
  },
  scoreText: {
    fontSize: 18,
    fontWeight: "800",
    color: "#7d685a",
    marginBottom: 6,
  },
  scoreHighlight: { fontSize: 36, fontWeight: "900", color: "#c85a32" },
  scoreSub: {
    fontSize: 13,
    color: "#8c6b58",
    fontWeight: "700",
    marginBottom: 24,
    textAlign: "center",
  },
  shareLargeBtn: {
    backgroundColor: "#c85a32",
    width: "100%",
    paddingVertical: 14,
    borderRadius: 12,
    alignItems: "center",
    marginBottom: 12,
    ...Platform.select({
      web: { boxShadow: "0px 4px 12px rgba(200, 90, 50, 0.2)" },
      default: {
        shadowColor: "#c85a32",
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.2,
        shadowRadius: 4,
        elevation: 2,
      },
    }),
  },
  shareBtnText: { color: "#ffffff", fontSize: 15, fontWeight: "900" },
  refreshLargeBtn: {
    backgroundColor: "#8c6b58",
    width: "100%",
    paddingVertical: 14,
    borderRadius: 12,
    alignItems: "center",
  },
  refreshBtnText: { color: "#ffffff", fontSize: 15, fontWeight: "800" },
  refreshSmallBtn: {
    width: "100%",
    marginTop: 16,
    paddingVertical: 8,
    alignSelf: "center",
    alignItems: "center",
    justifyContent: "center",
  },
  refreshSmallText: {
    fontSize: 13,
    color: "#8c6b58",
    fontWeight: "700",
    textDecorationLine: "underline",
    textAlign: "center",
  },

  toastContainer: {
    position: "absolute",
    top: Platform.OS === "ios" ? 60 : 40,
    alignSelf: "center",
    backgroundColor: "#4a3b32",
    paddingHorizontal: 24,
    paddingVertical: 14,
    borderRadius: 30,
    flexDirection: "row",
    alignItems: "center",
    zIndex: 9999,
    ...Platform.select({
      web: { boxShadow: "0px 6px 16px rgba(74, 59, 50, 0.25)" },
      default: {
        shadowColor: "#4a3b32",
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.3,
        shadowRadius: 6,
        elevation: 6,
      },
    }),
  },
  toastText: {
    color: "#ffffff",
    fontWeight: "800",
    fontSize: 14,
    textAlign: "center",
  },

  modalOverlay: {
    flex: 1,
    backgroundColor: "rgba(40, 30, 25, 0.75)",
    justifyContent: "flex-end",
  },
  modalContent: {
    backgroundColor: "#faf6f0",
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    borderTopWidth: 2,
    borderColor: "#e8ded4",
    padding: 22,
    alignItems: "center",
    maxHeight: "92%",
  },
  modalHeader: {
    width: "100%",
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 16,
  },
  modalTitle: {
    fontSize: 19,
    fontWeight: "900",
    color: "#4a3b32",
  },
  modalCloseText: {
    fontSize: 22,
    fontWeight: "900",
    color: "#8c6b58",
    paddingHorizontal: 8,
  },

  shareCardOuter: {
    width: 320,
    height: 420,
    backgroundColor: "#faf6f0",
    borderRadius: 24,
    borderWidth: 6,
    borderColor: "#4a3b32",
    padding: 8,
    marginBottom: 20,
    ...Platform.select({
      web: { boxShadow: "0px 8px 24px rgba(74, 59, 50, 0.15)" },
      default: {
        shadowColor: "#4a3b32",
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.15,
        shadowRadius: 8,
        elevation: 5,
      },
    }),
  },
  shareCardInner: {
    flex: 1,
    width: "100%",
    backgroundColor: "#faf6f0",
    borderRadius: 16,
    borderWidth: 1.5,
    borderColor: "#d9c9bc",
    padding: 16,
    justifyContent: "space-between",
    alignItems: "center",
  },
  previewImage: {
    width: 300,
    height: 433,
    borderRadius: 24,
    marginBottom: 20,
  },

  shareCardHeader: { alignItems: "center", marginTop: 4 },
  shareCardBadge: {
    backgroundColor: "#c85a32",
    color: "#ffffff",
    paddingHorizontal: 14,
    paddingVertical: 4,
    borderRadius: 14,
    fontSize: 12,
    fontWeight: "900",
    marginBottom: 10,
    overflow: "hidden",
  },
  shareCardTitle: {
    fontSize: 20,
    fontWeight: "900",
    color: "#4a3b32",
    textAlign: "center",
  },
  shareCardBody: {
    alignItems: "center",
    backgroundColor: "#ffffff",
    width: "100%",
    paddingVertical: 18,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: "#e8ded4",
  },
  shareCardEmoji: { fontSize: 40, marginBottom: 8 },
  shareCardScoreLabel: { fontSize: 13, color: "#8c6b58", fontWeight: "800" },
  shareCardScoreValue: {
    fontSize: 42,
    fontWeight: "900",
    color: "#c85a32",
    marginVertical: 4,
  },
  shareCardSubText: {
    fontSize: 12,
    color: "#5c4738",
    fontWeight: "700",
    textAlign: "center",
    lineHeight: 18,
    marginTop: 4,
  },
  shareCardFooter: {
    backgroundColor: "#f3e8df",
    width: "100%",
    paddingVertical: 10,
    borderRadius: 10,
    alignItems: "center",
  },
  shareCardFooterText: {
    fontSize: 10,
    color: "#5c4738",
    fontWeight: "800",
    textAlign: "center",
    lineHeight: 16,
  },

  modalActionRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    width: "100%",
    paddingBottom: Platform.OS === "ios" ? 14 : 4,
  },
  modalBtn: {
    alignItems: "center",
    backgroundColor: "#f3e8df",
    paddingVertical: 14,
    paddingHorizontal: 16,
    borderRadius: 16,
    borderWidth: 1.5,
    borderColor: "#e6d7c8",
    width: "48%",
    ...Platform.select({
      web: { boxShadow: "0px 4px 10px rgba(74, 59, 50, 0.08)" },
      default: {
        shadowColor: "#4a3b32",
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.1,
        shadowRadius: 4,
        elevation: 2,
      },
    }),
  },
  modalBtnIcon: { fontSize: 24, marginBottom: 6 },
  modalBtnText: { fontSize: 13, fontWeight: "900", color: "#5c4738" },

  alertOverlay: {
    flex: 1,
    backgroundColor: "rgba(40, 30, 25, 0.65)",
    justifyContent: "center",
    alignItems: "center",
    padding: 30,
  },
  alertBox: {
    width: "82%",
    backgroundColor: "#faf6f0",
    borderRadius: 22,
    borderWidth: 2.5,
    borderColor: "#4a3b32",
    paddingHorizontal: 22,
    paddingVertical: 24,
    alignItems: "center",
    ...Platform.select({
      web: { boxShadow: "0px 8px 24px rgba(74, 59, 50, 0.15)" },
      default: {
        shadowColor: "#4a3b32",
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.2,
        shadowRadius: 8,
        elevation: 5,
      },
    }),
  },
  alertIcon: {
    fontSize: 32,
    marginBottom: 6,
    textAlign: "center",
    width: "100%",
  },
  alertTitle: {
    fontSize: 18,
    fontWeight: "900",
    color: "#4a3b32",
    marginBottom: 12,
    textAlign: "center",
    alignSelf: "center",
    width: "100%",
  },
  alertMessage: {
    fontSize: 14,
    fontWeight: "700",
    color: "#5c4738",
    textAlign: "center",
    lineHeight: 22,
    marginBottom: 20,
    width: "100%",
  },
  alertButton: {
    backgroundColor: "#8c6b58",
    paddingVertical: 12,
    borderRadius: 14,
    width: "100%",
    alignItems: "center",
  },
  alertButtonText: {
    fontSize: 15,
    fontWeight: "900",
    color: "#ffffff",
  },
});
