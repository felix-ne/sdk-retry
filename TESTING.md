# 🧪 测试指南

## 快速运行

```bash
# 1. 安装依赖
npm install

# 2. 可视化测试界面（推荐）
npm run test:ui

# 3. 命令行模式
npm test

# 4. 查看覆盖率
npm run test:coverage
```

## 测试文件

```
tests/
├── storage-adapter.test.ts    # 存储适配器（15个测试）
├── retry-queue.test.ts        # 核心逻辑（35个测试）
├── types.test.ts              # 类型测试（10个测试）
└── integration.test.ts        # 集成测试（15个测试）

总计：75+ 测试用例
```

## 覆盖范围

### ✅ 核心功能
- 队列初始化、添加、处理
- 重试逻辑和指数退避
- 并发控制和过期清理

### ✅ 新功能（重点）
- **优先级淘汰**：优先删除低优先级
- **跨标签页锁**：避免重复上报

### ✅ 降级机制
- localStorage 不可用时降级到内存
- QuotaExceededError 处理

## 可视化界面

```bash
npm run test:ui
```

浏览器会打开 `http://localhost:51204/__vitest__/`

可以：
- 👀 实时查看测试运行
- 🎯 点击运行单个测试
- 📊 查看覆盖率
- 🐛 调试失败的测试

## 测试命令

```bash
npm test                 # 开发模式（watch）
npm run test:run        # 运行一次
npm run test:coverage   # 覆盖率报告
npm run test:ui         # 可视化界面
```

## 覆盖率目标

```
Lines      : ≥ 80%
Functions  : ≥ 80%
Branches   : ≥ 70%
Statements : ≥ 80%
```

## 查看报告

```bash
npm run test:coverage
open coverage/index.html
```

## 编写测试技巧

### 使用 Fake Timers

```typescript
beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
});

// 快进时间
vi.advanceTimersByTime(1000);
```

### Mock fetch

```typescript
(global.fetch as any).mockResolvedValue({ ok: true });
(global.fetch as any).mockRejectedValue(new Error('Network error'));
```

### Mock localStorage

```typescript
Object.defineProperty(window, 'localStorage', { value: null });
```

## 学习测试

查看测试代码了解如何使用：

```bash
# 简单测试
cat tests/storage-adapter.test.ts

# 复杂测试
cat tests/retry-queue.test.ts

# 完整流程
cat tests/integration.test.ts
```

## 测试失败？

1. 确保已安装依赖：`npm install`
2. 查看详细错误：`npm run test:run`
3. 使用可视化界面调试：`npm run test:ui`

## 快速上手

```bash
npm install && npm run test:ui
```

就这么简单！🎉
