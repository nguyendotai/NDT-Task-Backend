// Bộ preset ảnh đại diện Workspace (emoji + màu nền) — user tự chọn 1 preset
// lúc tạo Workspace, hoặc bỏ trống để hệ thống chọn ngẫu nhiên. Không phải ảnh
// upload thật, không dùng Cloudinary. Danh sách này PHẢI khớp với
// frontend/src/features/workspace/constants/avatar-presets.ts (giữ đồng bộ
// thủ công vì cả 2 phía cùng cần biết danh sách hợp lệ).
export interface WorkspaceAvatarPreset {
  emoji: string;
  color: string;
}

export const WORKSPACE_AVATAR_PRESETS: WorkspaceAvatarPreset[] = [
  { emoji: '🐵', color: 'blue' },
  { emoji: '🦊', color: 'orange' },
  { emoji: '🐼', color: 'slate' },
  { emoji: '🦄', color: 'pink' },
  { emoji: '🐙', color: 'purple' },
  { emoji: '🚀', color: 'sky' },
  { emoji: '🌈', color: 'rose' },
  { emoji: '🔥', color: 'red' },
  { emoji: '🌊', color: 'cyan' },
  { emoji: '🍀', color: 'green' },
  { emoji: '🎯', color: 'amber' },
  { emoji: '💎', color: 'teal' },
  { emoji: '🦁', color: 'yellow' },
  { emoji: '🐨', color: 'gray' },
  { emoji: '🐸', color: 'lime' },
  { emoji: '🦋', color: 'fuchsia' },
];

export function pickRandomWorkspaceAvatar(): WorkspaceAvatarPreset {
  const index = Math.floor(Math.random() * WORKSPACE_AVATAR_PRESETS.length);
  return WORKSPACE_AVATAR_PRESETS[index];
}

export function isValidWorkspaceAvatar(emoji: string, color: string): boolean {
  return WORKSPACE_AVATAR_PRESETS.some(
    (preset) => preset.emoji === emoji && preset.color === color,
  );
}
