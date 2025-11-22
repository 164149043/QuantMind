
// 禁用本地 PostCSS 插件，防止因未安装 tailwindcss 依赖导致的启动报错
// 样式渲染完全交给 index.html 中的 Tailwind CDN
export default {
  plugins: {
    // tailwindcss: {}, // Commented out to fix error
    // autoprefixer: {}, // Commented out to fix error
  },
}
