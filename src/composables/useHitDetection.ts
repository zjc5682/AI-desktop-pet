/**
 * ========================================
 * useHitDetection.ts - 碰撞检测工具
 * ========================================
 * 功能：提供坐标转换和矩形区域碰撞检测
 * 
 * 核心功能：
 * 1. 将屏幕坐标转换为 Live2D 归一化坐标 (-1 ~ 1)
 * 2. 检测点是否在矩形命中区域内
 * 
 * 应用场景：
 * - 鼠标悬停检测
 * - 点击区域判断
 * - 视线跟随计算
 */

export function useHitDetection() {
  /**
   * 检测点是否在矩形命中区域内
   * @param x - X 坐标（归一化，范围 -1 ~ 1）
   * @param y - Y 坐标（归一化，范围 -1 ~ 1）
   * @param area - 矩形区域定义，包含 x 和 y 的范围数组
   * @returns 是否在区域内
   */
  const isInHitArea = (x: number, y: number, area: { x: number[]; y: number[] }): boolean => {
    // 使用 min/max 确保可以处理任意顺序的坐标数组
    return x >= Math.min(...area.x) && x <= Math.max(...area.x) &&
           y >= Math.min(...area.y) && y <= Math.max(...area.y);
  };

  /**
   * 将屏幕坐标转换为 Live2D 归一化坐标
   * Live2D 使用左手坐标系：X 轴向右为正，Y 轴向上为正
   * @param clientX - 屏幕 X 坐标（像素）
   * @param clientY - 屏幕 Y 坐标（像素）
   * @param rect - Canvas 元素的边界矩形
   * @returns 归一化坐标 {x, y}，范围都是 -1 ~ 1
   */
  const getNormalizedCoords = (clientX: number, clientY: number, rect: DOMRect) => {
    // X 轴：从左到右映射到 -1 ~ 1
    const x = ((clientX - rect.left) / rect.width) * 2 - 1;
    // Y 轴：从下到上映射到 -1 ~ 1（注意屏幕坐标 Y 轴向下为正，需要取反）
    const y = -((clientY - rect.top) / rect.height) * 2 + 1;
    return { x, y };
  };

  // 返回公共 API
  return {
    isInHitArea,       // 碰撞检测
    getNormalizedCoords // 坐标转换
  };
}
