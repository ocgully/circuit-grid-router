/**
 * Minimum node spacing enforcement — pushes overlapping nodes apart.
 */
import type { NodeRect, RouterOptions } from './types.js';
/**
 * Adjust node positions so that no two nodes overlap or are closer than minNodeSpacing.
 * Uses a simple iterative spread (not full force-directed layout).
 */
export declare function enforceMinSpacing(nodeRects: NodeRect[], options?: RouterOptions): NodeRect[];
//# sourceMappingURL=spacing.d.ts.map