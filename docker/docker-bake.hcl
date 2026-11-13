# Alvos e tags das imagens (ADR 0003, 0008). O mesmo arquivo serve ao
# `pnpm local:images` e aos workflows images.yml e release.yml, então local e
# produção usam as mesmas tags: <IMAGE_REGISTRY>/<imagem>:<SHA do commit>.
#
# Cada unidade com imagem acrescenta um alvo e o inclui no grupo certo, por exemplo:
#
#   target "backoffice" {
#     inherits   = ["_base"]
#     dockerfile = "apps/backoffice/Dockerfile"
#     tags       = ["${IMAGE_REGISTRY}/backoffice:${TAG}"]
#   }
#

variable "IMAGE_REGISTRY" {
  default = "ghcr.io/orakel-ai-content"
}

variable "TAG" {
  default = "local"
}

# O GitHub Actions define CI=true. Fora dele (pnpm local:images), as imagens ganham também
# a tag "local", que é a que o compose local usa por padrão (BACKOFFICE_TAG).
variable "CI" {
  default = ""
}

function "tags" {
  params = [name]
  result = concat(["${IMAGE_REGISTRY}/${name}:${TAG}"], CI == "" ? ["${IMAGE_REGISTRY}/${name}:local"] : [])
}

# Plataforma da VPS no CI (images.yml, release.yml). Fora dele (pnpm local:images), a da
# máquina: as imagens locais nunca são publicadas e, num Mac com Apple Silicon, amd64 rodaria
# emulado. Forçar amd64 no local: PLATFORM=linux/amd64 pnpm local:images.
variable "PLATFORM" {
  default = ""
}

target "_base" {
  context   = "."
  platforms = PLATFORM != "" ? [PLATFORM] : CI != "" ? ["linux/amd64"] : []
  labels = {
    "org.opencontainers.image.source" = "https://github.com/Orakel-AI-Content/platform"
  }
}

target "backoffice" {
  inherits   = ["_base"]
  dockerfile = "apps/backoffice/Dockerfile"
  tags       = tags("backoffice")
}

# Plano e apply da infra de um site (ADR 0027): o build-runner a inicia como
# INFRA_RUNNER_IMAGE:<SHA do commit>.
target "infra-runner" {
  inherits   = ["_base"]
  dockerfile = "docker/infra-runner/Dockerfile"
  tags       = tags("infra-runner")
}

group "images" {
  targets = ["backoffice", "infra-runner"]
}

# Versão do site-builder (ADR 0018): o release.yml, disparado com version=X.Y.Z, publica
# com TAG=X.Y.Z e depois cria a tag Git site-builder-vX.Y.Z.
target "site-builder" {
  inherits   = ["_base"]
  dockerfile = "docker/site-builder/Dockerfile"
  tags       = tags("site-builder")
  args = {
    RELEASE = TAG
  }
}

group "release" {
  targets = ["site-builder"]
}

# Imagens só do ambiente local (substitutos da nuvem): construídas pelo pnpm local:images,
# nunca publicadas.
target "edge-local" {
  inherits   = ["_base"]
  dockerfile = "infra/local/edge-local/Dockerfile"
  tags       = tags("edge-local")
}

group "local" {
  targets = ["edge-local"]
}

group "default" {
  targets = ["images", "release", "local"]
}

# Imagens só de teste: fora dos grupos "images" e "release" (não são publicadas nem
# rodam no images.yml). Uso: docker buildx bake content-model-test
target "content-model-test" {
  inherits   = ["_base"]
  dockerfile = "packages/content-model/Dockerfile"
  target     = "test"
  output     = ["type=cacheonly"]
}

target "content-client-test" {
  inherits   = ["_base"]
  dockerfile = "packages/content-client/Dockerfile"
  target     = "test"
  output     = ["type=cacheonly"]
}

target "tokens-test" {
  inherits   = ["_base"]
  dockerfile = "packages/tokens/Dockerfile"
  target     = "test"
  output     = ["type=cacheonly"]
}

target "core-test" {
  inherits   = ["_base"]
  dockerfile = "packages/core/Dockerfile"
  target     = "test"
  output     = ["type=cacheonly"]
}

target "elements-test" {
  inherits   = ["_base"]
  dockerfile = "packages/elements/Dockerfile"
  target     = "test"
  output     = ["type=cacheonly"]
}

target "events-test" {
  inherits   = ["_base"]
  dockerfile = "packages/events/Dockerfile"
  target     = "test"
  output     = ["type=cacheonly"]
}

# Grupos: crie-os junto com o primeiro alvo de cada um (grupo vazio é erro no bake).
#
#   group "images"  { targets = ["backoffice", "infra-runner"] }  # a cada merge na main
#   group "release" { targets = ["site-builder"] }  # no release.yml (dispatch)
#   group "local"   { targets = ["edge-local"] }    # só o pnpm local:images
#   group "default" { targets = ["images", "release", "local"] }
#
# docker/bake.sh trata grupo inexistente como "nada a construir".
