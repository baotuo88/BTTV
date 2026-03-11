import { VodSource } from "@/types/drama";
import { ShortDramaSource } from "@/types/shorts-source";
import type { PlayerConfig } from "@/app/api/player-config/route";
import type { DailymotionChannelConfig } from "@/types/dailymotion-config";
import type { SiteConfigData } from "@/types/site-config";
import type { OperationsConfigData } from "@/types/operations-config";

export interface ToastState {
  message: string;
  type: "success" | "error" | "warning" | "info";
}

export interface ConfirmState {
  title: string;
  message: string;
  onConfirm: () => void | Promise<void>;
  danger?: boolean;
}

// 统一导入回调 - 用于跨 Tab 导入
export interface UnifiedImportCallbacks {
  onVodSourcesImport: (sources: VodSource[], selected?: string) => void;
  onShortsSourcesImport: (
    sources: ShortDramaSource[],
    selected?: string
  ) => void;
  onDailymotionImport: (
    channels: DailymotionChannelConfig[],
    defaultId?: string
  ) => void;
}

export interface VodSourcesTabProps {
  sources: VodSource[];
  selectedKey: string;
  onSourcesChange: (sources: VodSource[]) => void;
  onSelectedKeyChange: (key: string) => void;
  onShowToast: (toast: ToastState) => void;
  onShowConfirm: (confirm: ConfirmState) => void;
  unifiedImport?: UnifiedImportCallbacks;
}

export interface PlayerConfigTabProps {
  playerConfig: PlayerConfig;
  onConfigChange: (config: PlayerConfig) => void;
  onShowToast: (toast: ToastState) => void;
  onShowConfirm: (confirm: ConfirmState) => void;
}

export interface ShortsSourcesTabProps {
  sources: ShortDramaSource[];
  selectedKey: string;
  onSourcesChange: (sources: ShortDramaSource[]) => void;
  onSelectedKeyChange: (key: string) => void;
  onShowToast: (toast: ToastState) => void;
  onShowConfirm: (confirm: ConfirmState) => void;
  unifiedImport?: UnifiedImportCallbacks;
}

export interface DailymotionChannelsTabProps {
  channels: DailymotionChannelConfig[];
  defaultChannelId?: string;
  onChannelsChange: (
    channels: DailymotionChannelConfig[],
    defaultId?: string
  ) => void;
  onShowToast: (toast: ToastState) => void;
  onShowConfirm: (confirm: ConfirmState) => void;
  unifiedImport?: UnifiedImportCallbacks;
}

export interface UserManagementTabProps {
  onShowToast: (toast: ToastState) => void;
  onShowConfirm: (confirm: ConfirmState) => void;
}

export interface SiteSettingsTabProps {
  siteConfig: SiteConfigData;
  onConfigChange: (config: SiteConfigData) => void;
  onShowToast: (toast: ToastState) => void;
}

export interface OperationsSettingsTabProps {
  operationsConfig: OperationsConfigData;
  onConfigChange: (config: OperationsConfigData) => void;
  onShowToast: (toast: ToastState) => void;
}
