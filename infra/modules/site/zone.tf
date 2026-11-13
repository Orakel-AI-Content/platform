# Zona do site e configurações da seção 3.1 dos requisitos. O domínio raiz não tem registro
# aqui: o domínio personalizado do Worker é do wrangler (ADR 0027). O www só tem o registro do
# redirect (rules.tf).
resource "cloudflare_zone" "site" {
  account = {
    id = var.account_id
  }
  name = var.domain
  type = "full"
}

resource "cloudflare_zone_setting" "security_header" {
  zone_id    = cloudflare_zone.site.id
  setting_id = "security_header"
  value = {
    strict_transport_security = {
      enabled            = true
      max_age            = 31536000
      include_subdomains = true
      preload            = false
      nosniff            = true
    }
  }
}

resource "cloudflare_zone_setting" "min_tls_version" {
  zone_id    = cloudflare_zone.site.id
  setting_id = "min_tls_version"
  value      = "1.2"
}

resource "cloudflare_zone_setting" "always_use_https" {
  zone_id    = cloudflare_zone.site.id
  setting_id = "always_use_https"
  value      = "on"
}

# Smart Tiered Cache. O Crawler Hints não tem recurso no provider v5: passo manual da ADR 0027.
resource "cloudflare_tiered_cache" "site" {
  zone_id = cloudflare_zone.site.id
  value   = "on"
}
