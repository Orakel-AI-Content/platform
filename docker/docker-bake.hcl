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

target "_base" {
  context   = "."
  platforms = ["linux/amd64"]
  labels = {
    "org.opencontainers.image.source" = "https://github.com/Orakel-AI-Content/platform"
  }
}

target "backoffice" {
  inherits   = ["_base"]
  dockerfile = "apps/backoffice/Dockerfile"
  tags       = tags("backoffice")
}

group "images" {
  targets = ["backoffice"]
}

# Até existir o grupo "release" (site-builder), o default é só "images".
group "default" {
  targets = ["images"]
}

# Imagens só de teste: fora dos grupos "images" e "release" (não são publicadas nem
# rodam no images.yml). Uso: docker buildx bake content-model-test
target "content-model-test" {
  inherits   = ["_base"]
  dockerfile = "packages/content-model/Dockerfile"
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
#   group "images"  { targets = ["backoffice"] }    # backoffice e serviços, a cada merge na main
#   group "release" { targets = ["site-builder"] }  # na tag core-vX.Y.Z
#   group "default" { targets = ["images", "release"] }
#
# docker/bake.sh trata grupo inexistente como "nada a construir".
