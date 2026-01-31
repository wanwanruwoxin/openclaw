import type { ChannelMessageActionAdapter } from "openclaw/plugin-sdk";

/**
 * Message actions for proluofire-im
 *
 * TODO: Implement message actions based on proluofire-im's capabilities
 * - Reactions (if supported)
 * - Thread operations (if supported)
 * - Message editing/deletion (if supported)
 * - Custom proluofire-im-specific actions
 */
export const proluofireImMessageActions: ChannelMessageActionAdapter = {
  listActions: () => {
    // TODO: Return supported actions when proluofire-im capabilities are known
    return [];
  },

  supportsCards: () => {
    // TODO: Return true if proluofire-im supports cards
    return false;
  },

  supportsButtons: () => {
    // TODO: Return true if proluofire-im supports buttons
    return false;
  },
};
