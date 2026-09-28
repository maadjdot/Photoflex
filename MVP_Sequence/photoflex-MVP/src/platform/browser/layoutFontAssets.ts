import type { LayoutFontFamily, LayoutFontStyle, LayoutFontWeight } from "../../contracts";
import ancizarSerifRegularUrl from "../../assets/fonts/AncizarSerif/AncizarSerif.ttf?url";
import architectsDaughterRegularUrl from "../../assets/fonts/Architects_Daughter/ArchitectsDaughter-Regular.ttf?url";
import courierPrimeRegularUrl from "../../assets/fonts/Courier_Prime/CourierPrime-Regular.ttf?url";
import courierPrimeBoldUrl from "../../assets/fonts/Courier_Prime/CourierPrime-Bold.ttf?url";
import courierPrimeItalicUrl from "../../assets/fonts/Courier_Prime/CourierPrime-Italic.ttf?url";
import courierPrimeBoldItalicUrl from "../../assets/fonts/Courier_Prime/CourierPrime-BoldItalic.ttf?url";
import ebGaramondRegularUrl from "../../assets/fonts/EB_Garamond/static/EBGaramond-Regular.ttf?url";
import ebGaramondBoldUrl from "../../assets/fonts/EB_Garamond/static/EBGaramond-Bold.ttf?url";
import ebGaramondItalicUrl from "../../assets/fonts/EB_Garamond/static/EBGaramond-Italic.ttf?url";
import ebGaramondBoldItalicUrl from "../../assets/fonts/EB_Garamond/static/EBGaramond-BoldItalic.ttf?url";
import googleSansRegularUrl from "../../assets/fonts/Google_Sans/static/GoogleSans-Regular.ttf?url";
import googleSansBoldUrl from "../../assets/fonts/Google_Sans/static/GoogleSans-Bold.ttf?url";
import googleSansItalicUrl from "../../assets/fonts/Google_Sans/static/GoogleSans-Italic.ttf?url";
import googleSansBoldItalicUrl from "../../assets/fonts/Google_Sans/static/GoogleSans-BoldItalic.ttf?url";
import gudeaRegularUrl from "../../assets/fonts/Gudea/Gudea-Regular.ttf?url";
import gudeaBoldUrl from "../../assets/fonts/Gudea/Gudea-Bold.ttf?url";
import gudeaItalicUrl from "../../assets/fonts/Gudea/Gudea-Italic.ttf?url";
import lxgwWenKaiTcRegularUrl from "../../assets/fonts/LXGWWenKaiTC/LXGWWenKaiTC-Regular.ttf?url";
import lxgwWenKaiTcBoldUrl from "../../assets/fonts/LXGWWenKaiTC/LXGWWenKaiTC-Bold.ttf?url";
import notoSansScRegularUrl from "../../assets/fonts/Noto_Sans_SC/static/NotoSansSC-Regular.ttf?url";
import notoSansScBoldUrl from "../../assets/fonts/Noto_Sans_SC/static/NotoSansSC-Bold.ttf?url";
import notoSerifRegularUrl from "../../assets/fonts/Noto_Serif/static/NotoSerif-Regular.ttf?url";
import notoSerifBoldUrl from "../../assets/fonts/Noto_Serif/static/NotoSerif-Bold.ttf?url";
import notoSerifItalicUrl from "../../assets/fonts/Noto_Serif/static/NotoSerif-Italic.ttf?url";
import notoSerifBoldItalicUrl from "../../assets/fonts/Noto_Serif/static/NotoSerif-BoldItalic.ttf?url";
import notoSerifScRegularUrl from "../../assets/fonts/Noto_Serif_SC/static/NotoSerifSC-Regular.ttf?url";
import notoSerifScBoldUrl from "../../assets/fonts/Noto_Serif_SC/static/NotoSerifSC-Bold.ttf?url";
import patrickHandRegularUrl from "../../assets/fonts/Patrick_Hand/PatrickHand-Regular.ttf?url";
import robotoRegularUrl from "../../assets/fonts/Roboto/static/Roboto-Regular.ttf?url";
import robotoBoldUrl from "../../assets/fonts/Roboto/static/Roboto-Bold.ttf?url";
import robotoItalicUrl from "../../assets/fonts/Roboto/static/Roboto-Italic.ttf?url";
import robotoBoldItalicUrl from "../../assets/fonts/Roboto/static/Roboto-BoldItalic.ttf?url";
import specialEliteRegularUrl from "../../assets/fonts/Special_Elite/SpecialElite-Regular.ttf?url";
import zcoolQingKeHuangYouRegularUrl from "../../assets/fonts/ZCOOL_QingKe_HuangYou/ZCOOLQingKeHuangYou-PhotoFlex.ttf?url";
import zcoolXiaoWeiRegularUrl from "../../assets/fonts/ZCOOL_XiaoWei/ZCOOLXiaoWei-PhotoFlex.ttf?url";
import { LAYOUT_CHINESE_FALLBACK_FONT, LAYOUT_FONT_BY_FAMILY, layoutFontStyle, layoutFontWeight } from "../../modules/layout/layoutFonts";

interface LayoutFontFaces {
  readonly regular: string;
  readonly bold?: string;
  readonly italic?: string;
  readonly boldItalic?: string;
}

export interface ResolvedLayoutFontAsset {
  readonly url: string;
  readonly syntheticBold: boolean;
  readonly syntheticItalic: boolean;
}

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
  const requestedWeight = layoutFontWeight(weight);
  const requestedStyle = layoutFontStyle(style);
  const faces = LAYOUT_FONT_FACES[family];
  if (requestedWeight === "bold" && requestedStyle === "italic" && faces.boldItalic) {
    return { url: faces.boldItalic, syntheticBold: false, syntheticItalic: false };
  }
  if (requestedWeight === "bold" && faces.bold) {
    return { url: faces.bold, syntheticBold: false, syntheticItalic: requestedStyle === "italic" };
  }
  if (requestedStyle === "italic" && faces.italic) {
    return { url: faces.italic, syntheticBold: requestedWeight === "bold", syntheticItalic: false };
  }
  return { url: faces.regular, syntheticBold: requestedWeight === "bold", syntheticItalic: requestedStyle === "italic" };
}

const loadedFonts = new Map<string, Promise<void>>();

function loadOneLayoutFont(family: LayoutFontFamily, weight: LayoutFontWeight, style: LayoutFontStyle): Promise<void> {
  if (typeof document === "undefined" || !document.fonts?.load) return Promise.resolve();
  const key = `${family}:${weight}:${style}`;
  const cached = loadedFonts.get(key);
  if (cached) return cached;
  const cssWeight = weight === "bold" ? 700 : 400;
  const promise = document.fonts.load(`${style} ${cssWeight} 16px "${LAYOUT_FONT_BY_FAMILY[family].cssFamily}"`).then(() => undefined);
  loadedFonts.set(key, promise);
  return promise;
}

export function loadLayoutFont(family: LayoutFontFamily, weight?: LayoutFontWeight, style?: LayoutFontStyle): Promise<void> {
  const requestedWeight = layoutFontWeight(weight);
  const requestedStyle = layoutFontStyle(style);
  return family === LAYOUT_CHINESE_FALLBACK_FONT
    ? loadOneLayoutFont(family, requestedWeight, requestedStyle)
    : Promise.all([
      loadOneLayoutFont(family, requestedWeight, requestedStyle),
      loadOneLayoutFont(LAYOUT_CHINESE_FALLBACK_FONT, requestedWeight, requestedStyle),
    ]).then(() => undefined);
}
