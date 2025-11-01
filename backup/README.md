# 📦 备份文件说明

本目录包含已废弃的代码和文档，仅供参考。

## 文件列表

### retry-queue-indexeddb.ts
- **说明**: 基于 IndexedDB 的重试队列实现
- **废弃原因**: 对于成功率 99.9% 的场景，localStorage 完全够用，IndexedDB 过于复杂
- **保留原因**: 如果未来需要处理大量离线数据（>10MB），可以参考此实现

### COMPARISON.md
- **说明**: localStorage vs IndexedDB 详细对比文档
- **废弃原因**: 已确定使用 localStorage + 内存降级方案，不再需要对比
- **保留原因**: 帮助理解两种方案的区别和选择依据

## ⚠️ 注意

**不推荐使用这些文件！** 

当前方案（`src/` 目录）已经是最优解：
- ✅ localStorage + 内存降级
- ✅ 轻量、健壮、易维护
- ✅ 完美适配 99.9% 成功率的场景

## 📚 相关文档

如需了解当前方案，请查看：
- `../README.md` - 完整文档
- `../QUICKSTART.md` - 快速开始
- `../ARCHITECTURE.md` - 架构设计
- `../SUMMARY.md` - 项目总结



