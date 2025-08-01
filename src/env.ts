import { configService } from "./services/ConfigService.ts";

export const getBotToken = () => configService.getBotToken();
export const getModel = () => configService.getModel();
export const getInferenceParallelism = () => configService.getInferenceParallelism();
export const isDebugEnabled = () => configService.isDebugEnabled();
export const getAdminOverrideList = () => configService.getAdminOverrideList();
export const getRateLimitPerMinute = () => configService.getRateLimitPerMinute();
export const getUserIdList = () => configService.getUserIdList();
export const isWhitelistEnabled = () => configService.isWhitelistEnabled();
export const getJinaApiKey = () => configService.getJinaApiKey();
