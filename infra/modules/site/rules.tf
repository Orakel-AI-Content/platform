# Regras da zona (ADR-026 dos requisitos; seção 4.1 do 05). Um ruleset por fase, que é o ponto
# de entrada da zona naquela fase na v5 do provider.

# O www só redireciona: o registro existe para a borda receber a requisição. 100:: é o endereço
# de descarte que a Cloudflare indica para registros que só servem às regras da zona.
resource "cloudflare_dns_record" "www" {
  zone_id = cloudflare_zone.site.id
  name    = "www.${var.domain}"
  type    = "AAAA"
  content = "100::"
  proxied = true
  ttl     = 1
  comment = "www: só o redirect para o domínio raiz (ADR 0027)"
}

resource "cloudflare_ruleset" "redirect" {
  zone_id = cloudflare_zone.site.id
  name    = "Redirect do www"
  kind    = "zone"
  phase   = "http_request_dynamic_redirect"

  rules = [{
    description = "www para o domínio raiz, com caminho e query"
    expression  = "(http.host eq \"www.${var.domain}\")"
    action      = "redirect"
    action_parameters = {
      from_value = {
        status_code           = 301
        preserve_query_string = true
        target_url = {
          expression = "concat(\"https://${var.domain}\", http.request.uri.path)"
        }
      }
    }
  }]
}

# A única regra de rate limiting do plano Free: janela de 10 s, contagem por IP. /_e/* é o
# único caminho que executa código (e custa).
resource "cloudflare_ruleset" "rate_limit" {
  zone_id = cloudflare_zone.site.id
  name    = "Rate limiting dos eventos"
  kind    = "zone"
  phase   = "http_ratelimit"

  rules = [{
    description = "Eventos /_e/* por IP"
    expression  = "(http.request.uri.path wildcard \"/_e/*\")"
    action      = "block"
    ratelimit = {
      characteristics     = ["cf.colo.id", "ip.src"]
      period              = 10
      requests_per_period = var.events_rate_limit_requests
      mitigation_timeout  = 10
    }
  }]
}

# Uma regra só, para caber na cota do Free: crawlers de treinamento que ignoram o robots.txt
# (P10). Buscadores e bots de busca por IA não entram na lista.
resource "cloudflare_ruleset" "waf" {
  zone_id = cloudflare_zone.site.id
  name    = "Crawlers de treinamento de IA"
  kind    = "zone"
  phase   = "http_request_firewall_custom"

  rules = [{
    description = "Bloqueia crawlers de treinamento de IA pelo user-agent"
    expression  = join(" or ", [for agent in var.training_crawler_user_agents : "(lower(http.user_agent) contains \"${lower(agent)}\")"])
    action      = "block"
  }]
}

# Bot Fight Mode desligado (não aceita exceções no Free e injeta JS); robots.txt gerenciado
# desligado, porque o do build é o único; bloqueio de crawlers de IA da Cloudflare ligado.
resource "cloudflare_bot_management" "site" {
  zone_id               = cloudflare_zone.site.id
  fight_mode            = false
  is_robots_txt_managed = false
  ai_bots_protection    = "block"
}
