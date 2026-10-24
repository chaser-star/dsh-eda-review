# MARKETPLACE 鈥?涓婃灦娓呭崟涓庤瘉鎹棬

鐩爣甯傚満锛歚dsh-market`锛堟湰鏈哄畨瑁呯殑 `dshmarket@1.66.47`锛孧IT锛夊強鍏堕厤濂楁彁浜ょ珯 <https://www.dsh.so/zh/submit/>銆?
## 鏀跺綍纭潯浠讹紙dsh.so 鎺ュ彈鏍囧噯锛?
| 鏉′欢 | 鏈伐绋嬬姸鎬?|
| :--- | :--- |
| `dsh` 瀛楁锛圖SH 鍏煎淇″彿锛?| 鉁?`dsh.bundle.patch` |
| README 甯﹀畨瑁呰鏄?| 鉁?README.md銆屽畨瑁呫€嶈妭 |
| 寮€婧愯鍙瘉锛圫PDX 鍙瘑鍒級 | 鉁?Apache-2.0锛圠ICENSE + package.json锛?|
| 鎻掍欢 id 鍖归厤 `^[a-z0-9]+(-[a-z0-9]+)*$` | 鉁?浠撳簱鍚?鍖呭悕 `dsh-eda-review` |
| 鍙瀹夊叏鎵弿鐨勬簮鐮?| 鉁?`index.js` + `lib/frontmatter.mjs` |
| 瀹夊叏鎵弿鏃犻樆鏂骇鍙戠幇 | 鈴?鎻愪氦鍚庣敱 dsh.so 鎵ц |
| 鏃犲畨瑁呮湡鑴氭湰 | 鉁?preinstall/install/postinstall/prepare 鍧囦笉瀛樺湪 |

## 鐘舵€侊紙璇氬疄鍖哄垎锛?
| 鐘舵€?| 鍙栧€?| 璇存槑 |
| :--- | :--- | :--- |
| 鏈湴瀹¤ | 闈欐€?74/80锛? blockers | `audit-plugin.mjs` 2026-10-25 |
| 鍗曞厓娴嬭瘯 | 11 閫氳繃 / 0 澶辫触 | `node test/frontmatter.test.mjs` |
| 杩愯鏃堕獙鏀讹紙E3锛?| 鏈獙璇?| 闇€涓€娆℃€?Profile 瀹夎 + dump-config + 鍚姩鍐掔儫 |
| 甯傚満鏀跺綍 | **Declared**锛堜綔鑰呭０鏄庯級 | 鏈 dsh.so 鐙珛楠岃瘉涓?Verified |
| 鐗堟湰鍏煎鐭╅樀 | `unknown` | 鏈湪鍏蜂綋 DSH 鐗堟湰涓婂疄娴?|

## 鍥涗釜鐙珛 assurance 灞?
| 灞?| 褰撳墠 | 闇€瑕佺殑璇佹嵁 |
| :--- | :--- | :--- |
| discovery锛堝彂鐜帮級 | 鉁?鏈湴 candidate 璁板綍 | `docs/candidate-entry.json` |
| installability锛堝彲瀹夎锛?| 鈴?unknown | 涓€娆℃€?Profile `dsh plugin add` 鎴愬姛 + dump-config |
| runtime锛堣繍琛屾椂锛?| 鈴?unknown | 鎶€鑳藉嚭鐜板湪鍒楄〃骞跺彲琚皟鐢?|
| securityReview锛堝畨鍏ㄥ鏍革級 | 鈴?unknown | 鎻愪氦鍚庡钩鍙版壂鎻忔姤鍛婏紙automated-scan锛?|

## 涓婃灦姝ラ

1. 鎺ㄩ€佷粨搴撳苟鎵?`dsh-plugin` 璇濋锛?2. 鎵撳紑 <https://www.dsh.so/zh/submit/> 绮樿创浠撳簱 URL 鈫?鑷姩鎷夊彇/鏍￠獙/鎵弿锛?3. 鎵弿鏃犻樆鏂」鍚庢彁浜ゆ潯鐩?鈫?缁存姢鑰呭鏍稿悎鍏ワ紱
4. 鏀跺綍鍚庝负 Declared锛涜鍗囪嚦 Verified 闇€鎻愪氦鐪熷疄鍏煎鎬у疄娴嬫姤鍛婏紙瀹樻柟 Discussions 妯℃澘锛夈€?
## 涓?DSH STORE锛坮egistry 鍨嬪競鍦猴級鐨勫樊寮?
dsh.so / dshmarket 璧般€屾彁浜?鈫?骞冲彴鎵弿 鈫?瀹℃牳鏀跺綍銆嶏紱DSH STORE 鐨?catalog 鍒欒姹傚浐瀹?Commit銆佸洓灞?assurance 涓?`validate:registry` CI銆傛湰宸ョ▼鐨?bundle 缁撴瀯鍚屾椂婊¤冻涓よ€咃細`dsh.bundle.patch`銆佸敮涓€ entry id銆乸ackage-relative patch銆乴icense/repository 榻愬銆?