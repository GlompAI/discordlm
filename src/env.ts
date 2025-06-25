import { configService } from "./services/ConfigService.ts";

export const getApiKey = () => configService.getApiKey();
export const getBotToken = () => configService.getBotToken();
export const getModel = () => configService.getModel();
export const getTokenLimit = () => configService.getTokenLimit();
export const getBotSelfId = () => configService.getBotSelfId();
export const getPublicAvatarBaseUrl = () => configService.getPublicAvatarBaseUrl();
export const isAvatarServerEnabled = () => configService.isAvatarServerEnabled();
export const getAvatarServerPort = () => configService.getAvatarServerPort();
export const getInferenceParallelism = () => configService.getInferenceParallelism();
export const isDebugEnabled = () => configService.isDebugEnabled();
export const getAdminOverrideId = () => configService.getAdminOverrideId();
export const getRateLimitPerMinute = () => configService.getRateLimitPerMinute();
export const getUserIdList = () => configService.getUserIdList();
export const isWhitelistEnabled = () => configService.isWhitelistEnabled();
