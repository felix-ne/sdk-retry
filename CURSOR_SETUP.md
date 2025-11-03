# Cursor 独立配置指南

本文档说明如何让 Cursor 独立于 VSCode，特别是插件和扩展部分。

## 📋 已完成的配置

1. **创建了 `.cursor/` 目录** - 存放 Cursor 专属配置
2. **创建了 `.cursor/settings.json`** - Cursor 独立设置
3. **创建了 `.cursor/extensions.json`** - Cursor 独立扩展推荐列表

## 🔧 进一步配置步骤

### 1. 禁用 VSCode 扩展同步

在 Cursor 中：

1. 按 `Cmd+Shift+P` (Mac) 或 `Ctrl+Shift+P` (Windows/Linux)
2. 输入 "Preferences: Open User Settings (JSON)"
3. 添加或确认以下设置：

```json
{
  "settingsSync.enabled": false,
  "settingsSync.machine": "cursor-exclusive"
}
```

### 2. 分离扩展管理

#### 在 Cursor 中禁用 VSCode 扩展同步：

1. 打开 Cursor 设置 (`Cmd+,` 或 `Ctrl+,`)
2. 搜索 "sync"
3. 找到 "Settings Sync" 相关选项
4. 确保以下选项关闭：
   - ❌ Settings Sync
   - ❌ Extensions Sync (如果存在)

#### 手动管理 Cursor 扩展：

- 只在 Cursor 中安装你需要的扩展
- 不要从 VSCode 导入扩展配置
- 使用 `.cursor/extensions.json` 管理扩展推荐

### 3. 全局 Cursor 配置（可选）

如果你想在全局级别配置 Cursor（所有项目）：

1. 打开全局设置：`Cmd+Shift+P` → "Preferences: Open User Settings (JSON)"
2. 添加 Cursor 特定配置：

```json
{
  // 确保使用独立的设置文件
  "settingsSync.enabled": false,
  
  // Cursor 特定功能
  "cursor.chat.enabled": true,
  "cursor.cpp.disabledLanguages": [],
  
  // 不要共享 VSCode 的工作区配置
  "workbench.settings.useSplitJSON": true
}
```

### 4. 检查配置位置

Cursor 的配置文件位置：

- **macOS**: `~/Library/Application Support/Cursor/User/settings.json`
- **Windows**: `%APPDATA%\Cursor\User\settings.json`
- **Linux**: `~/.config/Cursor/User/settings.json`

VSCode 的配置文件位置：

- **macOS**: `~/Library/Application Support/Code/User/settings.json`
- **Windows**: `%APPDATA%\Code\User\settings.json`
- **Linux**: `~/.config/Code/User/settings.json`

两者是完全独立的目录。

## ✅ 验证配置

### 检查是否独立：

1. **扩展独立**：
   - 在 Cursor 中安装一个扩展
   - 检查 VSCode 中是否出现（不应该出现）

2. **设置独立**：
   - 在 Cursor 中修改一个设置
   - 检查 VSCode 中是否改变（不应该改变）

3. **工作区配置独立**：
   - `.cursor/` 目录只影响 Cursor
   - `.vscode/` 目录只影响 VSCode（如果有的话）

## 🚫 避免的操作

1. ❌ **不要**使用 VSCode 的设置同步功能导入到 Cursor
2. ❌ **不要**在 Cursor 中启用 GitHub Settings Sync（如果想完全独立）
3. ❌ **不要**手动复制 `.vscode/` 配置到 `.cursor/`
4. ❌ **不要**在两个编辑器中使用相同的扩展配置文件

## 📝 当前项目配置

本项目的 `.gitignore` 已经配置为：
- ✅ 排除 `.vscode/`（VSCode 配置不会被提交）
- ⚠️ `.cursor/` 目前**没有被排除**，如果需要也可以添加到 `.gitignore`

如果需要排除 `.cursor/`（让每个开发者有自己的 Cursor 配置），可以添加到 `.gitignore`。

## 🔄 更新 .gitignore（可选）

如果你想排除 `.cursor/` 让每个开发者独立配置：

```bash
# 在 .gitignore 中添加
.cursor/
```

或者如果你想提交项目级别的 Cursor 配置（推荐）：

```bash
# 保留 .cursor/ 在版本控制中，这样团队成员可以共享项目级别的 Cursor 配置
```

## 💡 最佳实践

1. **项目级别配置**：使用 `.cursor/` 目录管理项目特定的 Cursor 设置
2. **个人偏好**：使用全局 Cursor 设置管理个人偏好
3. **扩展管理**：使用 `.cursor/extensions.json` 推荐项目需要的扩展
4. **完全隔离**：关闭所有同步功能，手动管理扩展和设置

## 🆘 问题排查

如果发现 Cursor 和 VSCode 仍然共享设置：

1. 检查全局设置文件位置是否正确
2. 确认 `settingsSync.enabled` 已设置为 `false`
3. 检查是否有环境变量或系统级别配置影响
4. 重启 Cursor 使配置生效

