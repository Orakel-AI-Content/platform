# O domínio do site não envia e-mail: o SPF só autoriza o encaminhamento do Email Routing, que
# reescreve o remetente (SRS) no domínio do site. Um único registro SPF; dois dão permerror.
resource "cloudflare_dns_record" "spf" {
  zone_id = cloudflare_zone.site.id
  name    = var.domain
  type    = "TXT"
  content = "\"v=spf1 include:_spf.mx.cloudflare.net -all\""
  ttl     = 1
  comment = "SPF: só o encaminhamento do Email Routing (ADR 0027)"
}

resource "cloudflare_dns_record" "dmarc" {
  zone_id = cloudflare_zone.site.id
  name    = "_dmarc.${var.domain}"
  type    = "TXT"
  content = "\"v=DMARC1; p=reject; adkim=s; aspf=s\""
  ttl     = 1
  comment = "DMARC: o domínio não envia e-mail próprio (ADR 0027)"
}

# Liga o Email Routing depois do SPF: o nosso registro já existe quando a Cloudflare confere os
# registros exigidos (validar no primeiro apply real).
resource "cloudflare_email_routing_settings" "site" {
  zone_id = cloudflare_zone.site.id

  depends_on = [cloudflare_dns_record.spf]
}

# MX do Email Routing.
resource "cloudflare_email_routing_dns" "site" {
  zone_id = cloudflare_zone.site.id
  name    = var.domain

  depends_on = [cloudflare_email_routing_settings.site]
}

resource "cloudflare_email_routing_rule" "alias" {
  for_each = var.email_aliases

  zone_id = cloudflare_zone.site.id
  name    = "${each.value}@${var.domain}"
  enabled = true

  matchers = [{
    type  = "literal"
    field = "to"
    value = "${each.value}@${var.domain}"
  }]
  actions = [{
    type  = "forward"
    value = [var.email_forward_to]
  }]

  depends_on = [cloudflare_email_routing_settings.site]
}

resource "cloudflare_email_routing_catch_all" "site" {
  zone_id = cloudflare_zone.site.id
  name    = "Descarta o resto"
  enabled = true

  matchers = [{ type = "all" }]
  actions  = [{ type = "drop" }]

  depends_on = [cloudflare_email_routing_settings.site]
}
