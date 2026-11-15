<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, shallowRef } from "vue";
import AboutView from "./components/AboutView.vue";
import AppIcon from "./components/AppIcon.vue";
import EmbedView from "./components/EmbedView.vue";
import ExtractView from "./components/ExtractView.vue";
import VpietAboutView from "./components/VpietAboutView.vue";
import VpietEmbedView from "./components/VpietEmbedView.vue";
import VpietRunView from "./components/VpietRunView.vue";
import type { PixelImage } from "./core/pixel";

// モード（ドット絵ステガノ・VPiet）とページ（埋め込む・取り出す・説明）。URL の #/<モード>/<ページ> と対応させる
type Mode = "stegano" | "vpiet";
type Page = "embed" | "extract" | "about";
const modes: { id: Mode; label: string; short: string }[] = [
  { id: "stegano", label: "ドット絵ステガノ", short: "ステガノ" },
  { id: "vpiet", label: "VPiet", short: "VPiet" },
];
const tabs: { id: Page; label: string; slug: Record<Mode, string> }[] = [
  { id: "embed", label: "埋め込む", slug: { stegano: "embed", vpiet: "embed" } },
  { id: "extract", label: "取り出す", slug: { stegano: "extract", vpiet: "run" } },
  { id: "about", label: "説明", slug: { stegano: "about", vpiet: "about" } },
];
const mode = ref<Mode>("stegano");
const page = ref<Page>("embed");

function parseHash() {
  const [, m, p] = location.hash.replace(/^#/, "").split("/");
  const nm: Mode = m === "vpiet" ? "vpiet" : "stegano";
  const t = tabs.find((x) => x.slug[nm] === p);
  mode.value = nm;
  page.value = t?.id ?? "embed";
}
function go(m: Mode, p: Page) {
  const slug = tabs.find((t) => t.id === p)!.slug[m];
  const hash = `#/${m}/${slug}`;
  if (location.hash !== hash) location.hash = hash;
  mode.value = m;
  page.value = p;
}
onMounted(() => {
  parseHash();
  window.addEventListener("hashchange", parseHash);
});
onBeforeUnmount(() => window.removeEventListener("hashchange", parseHash));

const lead = computed(() =>
  mode.value === "stegano"
    ? "ドット絵の色の境界に、見た目を保ったまま文字列を埋め込みます。処理はすべてブラウザの中で行います。"
    : "ドット絵をなるべく保ったまま、Piet のプログラムとして実行すると文字列が出る画像に作り変えます。処理はすべてブラウザの中で行います。",
);

// 埋め込みの結果を取り出しの画面に渡す
const incoming = shallowRef<{ image: PixelImage; key: string; h: number; name: string } | null>(null);
function onVerify(image: PixelImage, key: string, h: number, name: string) {
  incoming.value = { image, key, h, name };
  go("stegano", "extract");
}
const vpietIncoming = shallowRef<{ image: PixelImage; name: string } | null>(null);
function onVpietRun(image: PixelImage, name: string) {
  vpietIncoming.value = { image, name };
  go("vpiet", "extract");
}
</script>

<template>
  <header class="bar">
    <div class="bar-inner">
      <!-- 1 段: タイトル → モードの切り替え（セグメント）→ ページのタブ（下線。akochan・tetris と同じ形）→ 右端に GitHub -->
      <button
        type="button"
        class="brand"
        @click="go(mode, 'embed')"
      >
        <span
          class="mark"
          aria-hidden="true"
        >
          <svg
            viewBox="0 0 16 16"
            width="16"
            height="16"
          >
            <rect
              x="2"
              y="2"
              width="5"
              height="5"
            />
            <rect
              x="9"
              y="9"
              width="5"
              height="5"
            />
            <rect
              x="9"
              y="2"
              width="5"
              height="5"
              opacity="0.45"
            />
            <rect
              x="2"
              y="9"
              width="5"
              height="5"
              opacity="0.45"
            />
          </svg>
        </span>
        <span class="name">ドット絵ステガノ</span>
      </button>
      <div
        class="modes"
        role="group"
        aria-label="モード"
      >
        <button
          v-for="m in modes"
          :key="m.id"
          type="button"
          class="mode"
          :aria-pressed="mode === m.id"
          :title="m.label"
          @click="go(m.id, mode === m.id ? page : 'embed')"
        >
          {{ m.short }}
        </button>
      </div>
      <nav
        class="tabs"
        aria-label="ページ"
      >
        <button
          v-for="t in tabs"
          :key="t.id"
          type="button"
          class="tab"
          :aria-current="page === t.id ? 'page' : undefined"
          @click="go(mode, t.id)"
        >
          {{ t.label }}
        </button>
      </nav>
      <a
        class="gh"
        :href="mode === 'vpiet' ? 'https://github.com/Muratam/vpiet' : 'https://github.com/Muratam/stegano_pixelart'"
        aria-label="GitHub"
        title="GitHub"
      >
        <AppIcon name="github" />
      </a>
    </div>
  </header>

  <main class="main">
    <p
      v-if="page !== 'about'"
      class="lead quiet"
    >
      {{ lead }}
    </p>
    <!-- 入力と結果はタブ・モードを移っても残す -->
    <EmbedView
      v-show="mode === 'stegano' && page === 'embed'"
      @verify="onVerify"
    />
    <ExtractView
      v-show="mode === 'stegano' && page === 'extract'"
      :incoming="incoming"
    />
    <AboutView v-if="mode === 'stegano' && page === 'about'" />
    <VpietEmbedView
      v-show="mode === 'vpiet' && page === 'embed'"
      @run="onVpietRun"
    />
    <VpietRunView
      v-show="mode === 'vpiet' && page === 'extract'"
      :incoming="vpietIncoming"
    />
    <VpietAboutView v-if="mode === 'vpiet' && page === 'about'" />
  </main>
</template>

<style scoped>
/*
 * 上の帯（1 段）。タブの見た目は Muratam/akochandaaaaaa の .ako-head・.ako-tab と同じ値（Muratam/tetris-esolang の T402 と同じ揃え方）。
 * モードの切り替えはページのタブと階層が違うので、下線のタブではなく枠の中の小さな切り替え（セグメント）にする。
 */
.bar {
  position: sticky;
  top: 0;
  z-index: 10;
  background: var(--bg);
  border-bottom: 1px solid var(--line);
}
.bar-inner {
  display: flex;
  align-items: center;
  gap: 8px;
  max-width: 1120px;
  min-height: 48px;
  margin: 0 auto;
  padding: 0 8px 0 16px;
}
.brand {
  display: flex;
  align-items: center;
  gap: 10px;
  flex: none;
  padding: 0;
  background: none;
  border: 0;
  color: var(--ink);
  font: inherit;
  cursor: pointer;
}
.mark {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 30px;
  height: 30px;
  border: 1px solid var(--line-strong);
  border-radius: var(--radius-sm);
  color: var(--accent);
}
.mark svg {
  fill: currentColor;
}
.name {
  font-size: 1rem;
  font-weight: 650;
  letter-spacing: 0.03em;
  white-space: nowrap;
}
/* モード: 枠で囲んだ 2 つのボタン。選んだ方を塗る */
.modes {
  display: inline-flex;
  flex: none;
  padding: 2px;
  background: var(--bg-side);
  border: 1px solid var(--line-strong);
  border-radius: var(--radius-sm);
}
.mode {
  min-height: 28px;
  padding: 0 10px;
  background: none;
  border: 0;
  border-radius: 3px;
  color: var(--ink-soft);
  font: inherit;
  font-size: 0.78rem;
  font-weight: 600;
  white-space: nowrap;
  cursor: pointer;
  -webkit-tap-highlight-color: transparent;
}
.mode:hover {
  color: var(--ink);
}
.mode[aria-pressed="true"] {
  background: var(--surface-3);
  color: var(--ink);
}
/* ページ: akochan と同じ下線のタブ */
.tabs {
  display: flex;
  flex: 1;
  min-width: 0;
  align-self: stretch;
  margin-bottom: -1px;
  overflow-x: auto;
  scrollbar-width: none;
}
.tab {
  flex: 1;
  min-height: 48px;
  padding: 0 4px;
  background: none;
  border: 0;
  border-bottom: 2px solid transparent;
  color: var(--ink-soft);
  font: inherit;
  font-size: 0.9rem;
  white-space: nowrap;
  cursor: pointer;
  -webkit-tap-highlight-color: transparent;
}
.tab:hover {
  color: var(--ink);
}
.tab[aria-current="page"] {
  color: var(--ink);
  font-weight: 600;
  border-bottom-color: var(--accent);
}
.gh {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 34px;
  height: 34px;
  flex: none;
  margin-left: auto;
  color: var(--ink-soft);
  border-radius: var(--radius-sm);
}
.gh:hover {
  color: var(--ink);
  background: var(--surface-2);
}
.gh .icon {
  width: 18px;
  height: 18px;
}
/* スマホ: タイトルの文字は隠して印だけ（読み上げには残す。akochan と同じ） */
@media (max-width: 699px) {
  .name {
    position: absolute;
    width: 1px;
    height: 1px;
    overflow: hidden;
    clip-path: inset(50%);
    white-space: nowrap;
  }
}
/* スマホ縦（390px）: 1 段に収まるように詰める（それでも収まらない幅ではタブの列が横にスクロールする） */
@media (max-width: 420px) {
  .bar-inner {
    gap: 6px;
    padding: 0 6px 0 10px;
  }
  .mode {
    padding: 0 7px;
  }
  .tab {
    padding: 0 2px;
    font-size: 0.86rem;
  }
}
@media (min-width: 700px) {
  .bar-inner {
    gap: 16px;
    padding: 0 16px;
  }
  .bar-inner {
    min-height: 56px;
  }
  .tabs {
    flex: 0 1 auto;
  }
  .tab {
    flex: none;
    min-height: 56px;
    padding: 0 16px;
  }
}
.main {
  display: grid;
  gap: 16px;
  max-width: 1120px;
  margin: 0 auto;
  padding: 16px 16px 48px;
}
.lead {
  font-size: 0.88rem;
}
</style>
