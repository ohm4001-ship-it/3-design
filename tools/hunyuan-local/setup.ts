/**
 * One-time install of the local Hunyuan3D-2mv server (`npm run ai:setup`):
 * clones the Hunyuan3D-2 repository and builds a Python venv with CUDA PyTorch
 * under `local-ai/` (git-ignored). Every step is skipped when already done.
 * Model weights download on the server's first start.
 */
import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { ROOT, PYTHON, REPO, VENV } from "./paths.ts";
import { join } from "node:path";

process.env["HF_HOME"] ??= join(ROOT, "cache", "huggingface");
process.env["HY3DGEN_MODELS"] ??= join(ROOT, "models");
process.env["PIP_CACHE_DIR"] ??= join(ROOT, "cache", "pip");
process.env["HF_HUB_DISABLE_IMPLICIT_TOKEN"] ??= "1";

/**
 * Shape generation only; texture synthesis needs ~16 GB VRAM and compiled
 * extensions. transformers 5 renamed the DINOv2 weights the Hunyuan checkpoint
 * stores (load fails with missing `attention.q_proj` keys), so it stays on 4.x
 * with the diffusers release that matches its huggingface_hub.
 */
const PACKAGES = [
  "diffusers==0.31.0",
  "transformers==4.46.3",
  "accelerate",
  "huggingface_hub",
  "einops",
  "omegaconf",
  "tqdm",
  "opencv-python",
  "numpy",
  "scikit-image",
  "trimesh",
  "pygltflib",
  "pymeshlab",
  "rembg[cpu]",
];

function run(command: string, args: readonly string[]): void {
  console.log(`> ${command} ${args.join(" ")}`);
  const result = spawnSync(command, args, { stdio: "inherit" });
  if (result.status !== 0)
    throw new Error(`실패: ${command} ${args.join(" ")}`);
}

if (!existsSync(REPO))
  run("git", [
    "clone",
    "--depth",
    "1",
    "https://github.com/Tencent-Hunyuan/Hunyuan3D-2.git",
    REPO,
  ]);
if (!existsSync(PYTHON))
  run(process.platform === "win32" ? "python" : "python3", [
    "-m",
    "venv",
    VENV,
  ]);
run(PYTHON, ["-m", "pip", "install", "-q", "--upgrade", "pip"]);
run(PYTHON, [
  "-m",
  "pip",
  "install",
  "-q",
  "torch",
  "torchvision",
  "--index-url",
  "https://download.pytorch.org/whl/cu124",
]);
run(PYTHON, ["-m", "pip", "install", "-q", ...PACKAGES]);
run(PYTHON, [
  "-c",
  "import torch; assert torch.cuda.is_available(), 'CUDA GPU 없음'; print('GPU:', torch.cuda.get_device_name(0))",
]);
run(PYTHON, [
  "-c",
  [
    "import os",
    "from huggingface_hub import hf_hub_download",
    "specs=[('tencent/Hunyuan3D-2mv','hunyuan3d-dit-v2-mv-turbo'),('tencent/Hunyuan3D-2','hunyuan3d-vae-v2-0-turbo')]",
    "[(print('Model:',repo,sub,name,flush=True),hf_hub_download(repo,sub+'/'+name,local_dir=os.path.join(os.environ['HY3DGEN_MODELS'],repo))) for repo,sub in specs for name in ['config.yaml','model.fp16.safetensors']]",
  ].join("; "),
]);
console.log("설치 완료. 'npm run ai:local -- --low-vram'으로 서버를 켜세요.");
