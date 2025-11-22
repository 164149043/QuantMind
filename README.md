
# QuantMind 智脑量化 (AI Quantitative Trading System)

QuantMind 是一个现代化的、AI 驱动的加密货币量化交易前端系统。它结合了传统的算法交易策略（如均线交叉、RSI 回归、马丁格尔）与 Google Gemini 生成式 AI 的市场分析能力，为交易者提供决策辅助。

## 核心功能

### 1. 实时与模拟市场数据
- **双模驱动**：支持 Binance WebSocket 实时行情接入，同时内置高保真市场模拟器（基于几何布朗运动）。
- **数据流**：默认使用 1分钟 K线进行高频策略计算。

### 2. 策略监控仪表盘 (Strategy Monitor)
- **实时决策矩阵**：取代传统的静态 K 线图，通过可视化的卡片展示每个策略的实时状态（买入/卖出/中立）。
- **市场状态识别 (Market Regime)**：系统自动识别当前市场是“单边趋势 (Trending)”还是“震荡整理 (Ranging)”，并计算波动率和趋势强度。
- **自动调优 (Auto-Tuning)**：基于市场状态，算法自动动态调整策略权重。例如在震荡市中降低 MA 策略权重，提高 RSI 策略权重。
- **综合共识引擎**: 将所有策略信号加权计算，生成最终的“强力买入”或“强力卖出”信号。

### 3. 强大的策略配置中心
系统内置多种经典量化策略，所有策略的核心参数均可在“全局配置”面板中进行微调，支持输入验证和参数说明：

#### 趋势跟随类
- **MA 双均线交叉 (MA Crossover)**: 
  - 包含斜率过滤逻辑，有效识别横盘震荡。
  - **可配置**: 快线/慢线周期 (Fast/Slow Period)。
- **EMA 指数均线交叉**: 
  - 反应更灵敏的趋势跟踪。
  - **MACD 趋势跟踪**: 
  - 经典的动能指标。
  - **可配置**: Fast EMA, Slow EMA, Signal Line 周期。
- **布林带突破 (Bollinger Breakout)**: 
  - 捕捉波动率突破。
  - **可配置**: 均线周期 (Period), 标准差倍数 (StdDev)。

#### 震荡与回归类
- **RSI 均值回归**: 
  - 经典的震荡策略，高抛低吸。
  - **可配置**: 计算周期, 超买阈值 (Overbought), 超卖阈值 (Oversold)。

#### 高级策略
- **马丁格尔网格 (Martingale DCA)**: 
  - **核心逻辑**: 逆势交易策略。当市场出现超卖信号（RSI）时建立首仓，随后如果价格下跌，则按设定的百分比（Price Drop）分批加仓以摊低持仓成本。
  - **止盈机制**: 当整体持仓的加权平均价达到目标收益率（Profit Target）时，一次性平仓所有头寸。
  - **风险提示**: 适合震荡行情。在单边暴跌行情中可能会占用大量保证金，请合理设置加仓倍数。
  - **可配置参数**: 补仓跌幅、止盈目标、加仓倍数 (Multiplier)。

### 4. 专业级持仓管理
- **实时盈亏监控**: 显示未结盈亏 (Unrealized PnL) 和 收益率 (ROE %)。
- **风险指标**: 实时计算维持保证金 (Margin) 和 强平价格 (Liquidation Price)。

### 5. AI 智能分析 (Gemini Powered)
- 集成 **Google Gemini 2.5 Flash** 模型。
- 根据当前盘面数据（K线序列）、用户风险偏好（保守/激进）及资金状况，生成自然语言的市场分析报告。
- 提供买卖置信度评分及具体操作建议。

## 📦 部署与本地运行 (Deployment & Setup)

如果您从 GitHub 下载了本项目，请按照以下步骤在本地部署运行。

### 1. 环境准备
- **Node.js**: 建议版本 v18+
- **包管理器**: npm 或 yarn

### 2. 安装依赖
在项目根目录下运行终端命令：

```bash
npm install
```

> **注意**: 如果遇到依赖报错或网页显示为空白（Black Screen），请确保安装了以下核心依赖：
> ```bash
> npm install react react-dom recharts @google/genai
> npm install -D tailwindcss postcss autoprefixer vite @vitejs/plugin-react
> ```

### 3. 配置环境变量 (关键步骤)
本项目使用 Google Gemini API，必须配置 API Key 才能使用 AI 分析功能。

1. 在项目根目录创建一个名为 `.env` 的文件。
2. 添加以下内容（将 `your_api_key_here` 替换为您在 Google AI Studio 申请的 Key）：

```env
VITE_API_KEY=AIzaSyxxxxxxxxxxxxxxxxxxxxxxxxxxxx
```

> **重要提示**: 
> - 变量名必须以 `VITE_` 开头，否则前端项目无法读取。
> - API Key 免费申请地址: [Google AI Studio](https://aistudiocdn.google.com/)

### 4. 启动开发服务器

```bash
npm run dev
```

启动后，控制台会显示访问地址（通常是 `http://localhost:5173`），在浏览器中打开即可。

### 5. 构建生产版本

```bash
npm run build
```

## 技术栈

- **核心框架**: React 19, TypeScript, Vite
- **样式库**: Tailwind CSS
- **图表库**: Recharts
- **AI SDK**: @google/genai (Google Gemini API)
- **数据源**: WebSocket (Binance API) / Local Simulation

## 免责声明

本项目仅供学习、研究及模拟交易使用。加密货币交易风险极高，AI 分析结果仅供参考，不构成任何财务建议。实盘交易请务必谨慎。
