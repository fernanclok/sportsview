import type { Channel } from "../types";
import type { TvTarget } from "./fullscreen";

// Sending to the TV = using a second display (AirPlay "extended display" or HDMI).
// Only available in the Electron app.

const bridge = () => window.sportsview;
const noop = () => () => {};

export const tvSupported = () => !!bridge()?.tvTargets;
export const tvTargets = (): Promise<TvTarget[]> => bridge()?.tvTargets() ?? Promise.resolve([]);
export const tvOpen = (c: Channel, displayId: number) => bridge()!.tvOpen(c, displayId);
export const tvClose = () => void bridge()?.tvClose();
export const tvMultiview = (displayId: number | null) => void bridge()?.tvMultiview(displayId);
export const onTvMultiview = (cb: (on: boolean) => void) => bridge()?.onTvMultiview(cb) ?? noop();
export const onTvClosed = (cb: () => void) => bridge()?.onTvClosed(cb) ?? noop();
export const onTvChannel = (cb: (c: Channel) => void) => bridge()?.onTvChannel((c) => cb(c as Channel)) ?? noop();
export const onDisplaysChanged = (cb: () => void) => bridge()?.onDisplaysChanged(cb) ?? noop();
