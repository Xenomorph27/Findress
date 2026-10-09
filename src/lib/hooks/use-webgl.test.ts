import { describe, expect, it } from "vitest";
import { SOFTWARE_RENDERER } from "./use-webgl";

describe("software renderer guard", () => {
  it.each([
    "ANGLE (Google, Vulkan 1.3.0 (SwiftShader Device (Subzero) (0x0000C0DE)), SwiftShader driver)",
    "llvmpipe (LLVM 15.0.7, 256 bits)",
    "ANGLE (Microsoft, Microsoft Basic Render Driver Direct3D11 vs_5_0 ps_5_0)",
  ])("treats %s as software", (r) => expect(SOFTWARE_RENDERER.test(r)).toBe(true));

  it.each([
    "ANGLE (NVIDIA, NVIDIA GeForce RTX 4060 Laptop GPU Direct3D11 vs_5_0 ps_5_0, D3D11)",
    "ANGLE (Intel, Intel(R) Iris(R) Xe Graphics Direct3D11 vs_5_0 ps_5_0, D3D11)",
    "Apple M3",
    "Adreno (TM) 740",
  ])("treats %s as hardware", (r) => expect(SOFTWARE_RENDERER.test(r)).toBe(false));
});
