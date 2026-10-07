import type { LayoutFontFamily, LayoutFontStyle, LayoutFontWeight } from "../../contracts";
import ancizarSerifRegularUrl from "../../assets/fonts/AncizarSerif/AncizarSerif.woff2?url";
import architectsDaughterRegularUrl from "../../assets/fonts/Architects_Daughter/ArchitectsDaughter-Regular.woff2?url";
import courierPrimeRegularUrl from "../../assets/fonts/Courier_Prime/CourierPrime-Regular.woff2?url";
import courierPrimeBoldUrl from "../../assets/fonts/Courier_Prime/CourierPrime-Bold.woff2?url";
import courierPrimeItalicUrl from "../../assets/fonts/Courier_Prime/CourierPrime-Italic.woff2?url";
import courierPrimeBoldItalicUrl from "../../assets/fonts/Courier_Prime/CourierPrime-BoldItalic.woff2?url";
import ebGaramondRegularUrl from "../../assets/fonts/EB_Garamond/static/EBGaramond-Regular.woff2?url";
import ebGaramondBoldUrl from "../../assets/fonts/EB_Garamond/static/EBGaramond-Bold.woff2?url";
import ebGaramondItalicUrl from "../../assets/fonts/EB_Garamond/static/EBGaramond-Italic.woff2?url";
import ebGaramondBoldItalicUrl from "../../assets/fonts/EB_Garamond/static/EBGaramond-BoldItalic.woff2?url";
import googleSansRegularUrl from "../../assets/fonts/Google_Sans/static/GoogleSans-Regular.woff2?url";
import googleSansBoldUrl from "../../assets/fonts/Google_Sans/static/GoogleSans-Bold.woff2?url";
import googleSansItalicUrl from "../../assets/fonts/Google_Sans/static/GoogleSans-Italic.woff2?url";
import googleSansBoldItalicUrl from "../../assets/fonts/Google_Sans/static/GoogleSans-BoldItalic.woff2?url";
import gudeaRegularUrl from "../../assets/fonts/Gudea/Gudea-Regular.woff2?url";
import gudeaBoldUrl from "../../assets/fonts/Gudea/Gudea-Bold.woff2?url";
import gudeaItalicUrl from "../../assets/fonts/Gudea/Gudea-Italic.woff2?url";
import lxgwWenKaiTcRegularUrl from "../../assets/fonts/LXGWWenKaiTC/LXGWWenKaiTC-Regular.woff2?url";
import lxgwWenKaiTcBoldUrl from "../../assets/fonts/LXGWWenKaiTC/LXGWWenKaiTC-Bold.woff2?url";
import notoSansScRegularUrl from "../../assets/fonts/Noto_Sans_SC/static/NotoSansSC-Regular.woff2?url";
import notoSansScBoldUrl from "../../assets/fonts/Noto_Sans_SC/static/NotoSansSC-Bold.woff2?url";
import notoSerifRegularUrl from "../../assets/fonts/Noto_Serif/static/NotoSerif-Regular.woff2?url";
import notoSerifBoldUrl from "../../assets/fonts/Noto_Serif/static/NotoSerif-Bold.woff2?url";
import notoSerifItalicUrl from "../../assets/fonts/Noto_Serif/static/NotoSerif-Italic.woff2?url";
import notoSerifBoldItalicUrl from "../../assets/fonts/Noto_Serif/static/NotoSerif-BoldItalic.woff2?url";
import notoSerifScRegularUrl from "../../assets/fonts/Noto_Serif_SC/static/NotoSerifSC-Regular.woff2?url";
import notoSerifScBoldUrl from "../../assets/fonts/Noto_Serif_SC/static/NotoSerifSC-Bold.woff2?url";
import patrickHandRegularUrl from "../../assets/fonts/Patrick_Hand/PatrickHand-Regular.woff2?url";
import robotoRegularUrl from "../../assets/fonts/Roboto/static/Roboto-Regular.woff2?url";
import robotoBoldUrl from "../../assets/fonts/Roboto/static/Roboto-Bold.woff2?url";
import robotoItalicUrl from "../../assets/fonts/Roboto/static/Roboto-Italic.woff2?url";
import robotoBoldItalicUrl from "../../assets/fonts/Roboto/static/Roboto-BoldItalic.woff2?url";
import specialEliteRegularUrl from "../../assets/fonts/Special_Elite/SpecialElite-Regular.woff2?url";
import zcoolQingKeHuangYouRegularUrl from "../../assets/fonts/ZCOOL_QingKe_HuangYou/ZCOOLQingKeHuangYou-PhotoFlex.woff2?url";
import zcoolXiaoWeiRegularUrl from "../../assets/fonts/ZCOOL_XiaoWei/ZCOOLXiaoWei-PhotoFlex.woff2?url";
import { LAYOUT_CHINESE_FALLBACK_FONT, LAYOUT_FONT_BY_FAMILY, layoutFontStyle, layoutFontWeight, needsLayoutChineseFallback } from "../../modules/layout/layoutFonts";

import { resolveLayoutFontFace, type LayoutFontFaces, type ResolvedLayoutFontAsset } from "../../modules/layout/layoutFontFaces";
export type { ResolvedLayoutFontAsset } from "../../modules/layout/layoutFontFaces";

const LAYOUT_FONT_FACES: Readonly<Record<LayoutFontFamily, LayoutFontFaces>> = {
  "ancizar-serif": { regular: ancizarSerifRegularUrl },
  "architects-daughter": { regular: architectsDaughterRegularUrl },
  "courier-prime": { regular: courierPrimeRegularUrl, bold: courierPrimeBoldUrl, italic: courierPrimeItalicUrl, boldItalic: courierPrimeBoldItalicUrl },
  "eb-garamond": { regular: ebGaramondRegularUrl, bold: ebGaramondBoldUrl, italic: ebGaramondItalicUrl, boldItalic: ebGaramondBoldItalicUrl },
  "google-sans": { regular: googleSansRegularUrl, bold: googleSansBoldUrl, italic: googleSansItalicUrl, boldItalic: googleSansBoldItalicUrl },
  "gudea": { regular: gudeaRegularUrl, bold: gudeaBoldUrl, italic: gudeaItalicUrl },
  "lxgw-wenkai-tc": { regular: lxgwWenKaiTcRegularUrl, bold: lxgwWenKaiTcBoldUrl },
  "noto-sans-sc": { regular: notoSansScRegularUrl, bold: notoSansScBoldUrl },
  "noto-serif": { regular: notoSerifRegularUrl, bold: notoSerifBoldUrl, italic: notoSerifItalicUrl, boldItalic: notoSerifBoldItalicUrl },
  "noto-serif-sc": { regular: notoSerifScRegularUrl, bold: notoSerifScBoldUrl },
  "patrick-hand": { regular: patrickHandRegularUrl },
  "roboto": { regular: robotoRegularUrl, bold: robotoBoldUrl, italic: robotoItalicUrl, boldItalic: robotoBoldItalicUrl },
  "special-elite": { regular: specialEliteRegularUrl },
  "zcool-kuaile": { regular: notoSerifScRegularUrl, bold: notoSerifScBoldUrl },
  "zcool-qingke-huangyou": { regular: zcoolQingKeHuangYouRegularUrl },
  "zcool-xiaowei": { regular: zcoolXiaoWeiRegularUrl },
};

export function resolveLayoutFontAsset(family: LayoutFontFamily, weight?: LayoutFontWeight, style?: LayoutFontStyle): ResolvedLayoutFontAsset {
  return resolveLayoutFontFace(LAYOUT_FONT_FACES[family], weight, style);
}

const loadedFonts = new Map<string, Promise<void>>();
const failedFonts = new Set<string>();

function loadOneLayoutFont(family: LayoutFontFamily, weight: LayoutFontWeight, style: LayoutFontStyle): Promise<void> {
  if (typeof document === "undefined" || !document.fonts?.load) return Promise.resolve();
  const key = `${family}:${weight}:${style}`;
  const cached = loadedFonts.get(key);
  if (cached) return cached;
  const cssWeight = weight === "bold" ? 700 : 400;
  const cssFamily = LAYOUT_FONT_BY_FAMILY[family].cssFamily;
  // A CSS FontFace retains its failed load promise. Retrying needs a new face,
  // with the native weight/style so browser synthesis remains unchanged.
  const loading = failedFonts.has(key) && typeof FontFace === "function" && document.fonts.add
    ? (() => {
      const asset = resolveLayoutFontAsset(family, weight, style);
      const face = new FontFace(cssFamily, `url("${asset.url}")`, {
        weight: String(asset.syntheticBold ? 400 : cssWeight), style: asset.syntheticItalic ? "normal" : style,
      });
      return face.load().then((loaded) => { document.fonts.add(loaded); });
    })()
    : document.fonts.load(`${style} ${cssWeight} 16px "${cssFamily}"`).then(() => undefined);
  const promise = loading.catch((error: unknown) => {
    failedFonts.add(key);
    if (loadedFonts.get(key) === promise) loadedFonts.delete(key);
    throw error;
  });
  loadedFonts.set(key, promise);
  return promise;
}

export function loadLayoutFont(family: LayoutFontFamily, weight?: LayoutFontWeight, style?: LayoutFontStyle, text?: string): Promise<void> {
  const requestedWeight = layoutFontWeight(weight);
  const requestedStyle = layoutFontStyle(style);
  return !needsLayoutChineseFallback(family, text, requestedWeight, requestedStyle)
    ? loadOneLayoutFont(family, requestedWeight, requestedStyle)
    : Promise.all([
      loadOneLayoutFont(family, requestedWeight, requestedStyle),
      loadOneLayoutFont(LAYOUT_CHINESE_FALLBACK_FONT, requestedWeight, requestedStyle),
    ]).then(() => undefined);
}
