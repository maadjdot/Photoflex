// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { LanguageSwitcher, LOCALE_STORAGE_KEY, LocaleProvider, useLocale } from "./locale";
import { translate } from "./localeDictionary";

function CopyProbe() {
  const { locale, t } = useLocale();
  return <><span data-testid="locale">{locale}</span><span>{t("table.empty")}</span><span>{t("common.photoCount", { count: 3 })}</span></>;
}

describe("localization", () => {
  beforeEach(() => window.localStorage.clear());
  afterEach(cleanup);

  it("falls back to English and interpolates variables", () => {
    expect(translate("zh-CN", "missing.key", undefined, "Fallback copy")).toBe("Fallback copy");
    expect(translate("zh-CN", "common.photoCount", { count: 8 })).toBe("8 张照片");
    expect(translate("en", "common.photoCount", { count: 1 })).toBe("1 photo");
    expect(translate("zh-CN", "table.memo")).toBe("便笺");
    expect(translate("zh-CN", "table.memoPlaceholder")).toBe("写下你的想法…");
    expect(translate("zh-CN", "table.addToSequence")).toBe("加入序列");
    expect(translate("zh-CN", "table.createSequence")).toBe("创建序列");
    expect(translate("zh-CN", "table.shuffle")).toBe("打乱");
  });

  it("switches the visible interface to Chinese and persists the choice", () => {
    render(<LocaleProvider><LanguageSwitcher /><CopyProbe /></LocaleProvider>);
    fireEvent.click(screen.getByRole("button", { name: "中文" }));
    expect(screen.getByText("把照片放在这里，与它们一起思考。")).toBeTruthy();
    expect(screen.getByTestId("locale").textContent).toBe("zh-CN");
    expect(window.localStorage.getItem(LOCALE_STORAGE_KEY)).toBe("zh-CN");
    expect(document.documentElement.lang).toBe("zh-CN");
  });

  it("restores the saved locale", () => {
    window.localStorage.setItem(LOCALE_STORAGE_KEY, "zh-CN");
    render(<LocaleProvider><CopyProbe /></LocaleProvider>);
    expect(screen.getByText("3 张照片")).toBeTruthy();
  });
});
