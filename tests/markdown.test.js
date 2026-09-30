/* ==========================================================================
 * tests/markdown.test.js —— src/core/markdown.js 单测（P1-4f）
 *
 * 为什么值得专门补：这两个函数是 AI 回复进入页面的**唯一通道**，也是本站唯一
 *   一处把外部文本交给 v-html 的地方。此前它们埋在 AiChatModal.vue 里，一条测试
 *   都没有 —— 等于安全闸门没有网。P1-4f 把纯函数外移到 core 时一并补上。
 *
 * 分四层：
 *   ① escHtml：转义本身（整套安全模型的地基）；
 *   ② 安全：HTML 注入、属性注入、协议注入（javascript: / data:）必须被挡住；
 *   ③ 渲染：粗体 / 斜体 / 行内码 / 代码块 / 链接 / 换行，以及多块占位不串号；
 *   ④ 顺序与边界：代码块内的行内标记**不得**被二次处理；未闭合围栏保持原样。
 *   另有一组「已知怪癖」——**故意锁定**，改动了就会红，逼人先想清楚再改。
 *
 * ⚠️ 不 import vitest API —— 见 vite.config.js test.globals 的根因说明：
 *   本环境下 `import { describe } from 'vitest'` 会解析到另一份模块实例，
 *   使整个文件在收集阶段就失败（0 test）。describe/it/expect 由 globals 注入。
 * ========================================================================== */
import { escHtml, renderMarkdown } from '@/core/markdown';

/* 反引号单独取出，避免在测试源码里写三连反引号被误读 */
const B = '`';
const F = B + B + B; /* ``` */

describe('escHtml：& < > " 实体化（整套安全模型的地基）', () => {
  it('五个字符各自转义', () => {
    expect(escHtml('&')).toBe('&amp;');
    expect(escHtml('<')).toBe('&lt;');
    expect(escHtml('>')).toBe('&gt;');
    expect(escHtml('"')).toBe('&quot;');
  });

  it('组合串按顺序整体转义（& 先跑，不会二次解码）', () => {
    expect(escHtml('a & b < c > d "e"')).toBe('a &amp; b &lt; c &gt; d &quot;e&quot;');
    /* 已经是实体的文本会被再转义一层 —— 这是**正确**的：页面看到的是字面量 &lt; */
    expect(escHtml('&lt;')).toBe('&amp;lt;');
  });

  it('非字符串入参走 String()，不抛', () => {
    expect(escHtml(123)).toBe('123');
    expect(escHtml(null)).toBe('null');
    expect(escHtml(undefined)).toBe('undefined');
  });

  it('⚠️ 已知：**不转义单引号**（生成的属性一律用双引号，故无注入面）', () => {
    expect(escHtml("'")).toBe("'");
  });
});

describe('安全：外部文本不得注入 HTML', () => {
  it('<script> 被实体化，输出里没有裸标签', () => {
    const out = renderMarkdown('<script>alert(1)</script>');
    expect(out).toBe('&lt;script&gt;alert(1)&lt;/script&gt;');
    expect(out).not.toContain('<script');
  });

  it('<img onerror> 被实体化', () => {
    const out = renderMarkdown('<img src=x onerror=alert(1)>');
    expect(out).toBe('&lt;img src=x onerror=alert(1)&gt;');
    expect(out).not.toContain('<img');
  });

  it('属性注入（引号闭合）被挡住', () => {
    const out = renderMarkdown('"><script>alert(1)</script>');
    expect(out).toBe('&quot;&gt;&lt;script&gt;alert(1)&lt;/script&gt;');
  });

  it('javascript: 协议不生成 <a>（链接正则限定 https?://）', () => {
    const out = renderMarkdown('[x](javascript:alert(1))');
    expect(out).not.toContain('<a ');
    expect(out).toBe('[x](javascript:alert(1))');
  });

  it('data: / ftp: 等其它协议同样不生成 <a>', () => {
    expect(renderMarkdown('[x](data:text/html,<script>1</script>)')).not.toContain('<a ');
    expect(renderMarkdown('[x](ftp://a.example)')).toBe('[x](ftp://a.example)');
  });

  it('只有 https?:// 才转成链接，且带 target/rel 加固', () => {
    expect(renderMarkdown('[Zelm](https://a.example/p)')).toBe(
      '<a href="https://a.example/p" target="_blank" rel="noopener noreferrer">Zelm</a>',
    );
    expect(renderMarkdown('[Z](http://a.example)')).toContain('href="http://a.example"');
  });
});

describe('渲染：行内与块级形态', () => {
  it('null / undefined / 空串 → 空串（不抛）', () => {
    expect(renderMarkdown(null)).toBe('');
    expect(renderMarkdown(undefined)).toBe('');
    expect(renderMarkdown('')).toBe('');
  });

  it('粗体 / 斜体 / 行内码', () => {
    expect(renderMarkdown('**b**')).toBe('<strong>b</strong>');
    expect(renderMarkdown('*i*')).toBe('<em>i</em>');
    expect(renderMarkdown(B + 'c' + B)).toBe('<code class="ai-inline-code">c</code>');
  });

  it('粗体不会被斜体规则二次命中', () => {
    expect(renderMarkdown('**b** and *i*')).toBe('<strong>b</strong> and <em>i</em>');
  });

  it('夹在文本中的星号同样生效（(^|[^*]) 分支）', () => {
    expect(renderMarkdown('a*b*c')).toBe('a<em>b</em>c');
  });

  it('单个换行 → <br>', () => {
    expect(renderMarkdown('a\nb')).toBe('a<br>b');
  });

  it('代码块：去掉语言标识、包成 pre>code', () => {
    expect(renderMarkdown(F + 'js\nconst a=1;\n' + F)).toBe(
      '<pre class="ai-code"><code>const a=1;\n</code></pre>',
    );
  });

  it('多个代码块：占位序号不串位', () => {
    const out = renderMarkdown(F + '\nA\n' + F + '\n' + F + '\nB\n' + F);
    expect(out).toBe(
      '<pre class="ai-code"><code>A\n</code></pre><br><pre class="ai-code"><code>B\n</code></pre>',
    );
  });
});

describe('顺序与边界：代码块内容不被二次处理', () => {
  it('块内的 **x** 保持字面量（不被加粗）', () => {
    expect(renderMarkdown(F + '\n**x**\n' + F)).toBe(
      '<pre class="ai-code"><code>**x**\n</code></pre>',
    );
  });

  it('块内的 <b> 先被转义（escHtml 在最前面跑）', () => {
    expect(renderMarkdown(F + '\n<b>hi</b>\n' + F)).toBe(
      '<pre class="ai-code"><code>&lt;b&gt;hi&lt;/b&gt;\n</code></pre>',
    );
  });

  it('未闭合的围栏按普通文本处理（不吞掉后面所有内容）', () => {
    expect(renderMarkdown(F + 'js\ncode')).toBe('```js<br>code');
  });

  it('行内码不跨行（规则里的 [^`\\n]）', () => {
    expect(renderMarkdown(B + 'a\nb' + B)).toBe('`a<br>b`');
  });
});

describe('已知怪癖（故意锁定：改动了这里会红，请先想清楚再改）', () => {
  /* 占位符用的是 Unicode 私用区 \uE000 + 序号。正常文本不可能出现，
     但**模型输出是可以出现的** —— 一旦出现，那一段会被当成占位符还原，
     而 blocks 为空 → 还原成空串，于是内容被静默吞掉。
     当前取舍：不为此加转义（概率极低、加转义会让正则更脆），但把它锁在这里。 */
  it('私用区占位符序列会被吞掉（blocks 为空 → 还原成空串）', () => {
    expect(renderMarkdown('\uE0000\uE000')).toBe('');
  });

  it('escHtml 不处理单引号（属性一律双引号，故无注入面）', () => {
    expect(escHtml("it's")).toBe("it's");
  });
});
