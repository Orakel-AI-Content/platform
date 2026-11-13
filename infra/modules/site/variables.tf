variable "account_id" {
  description = "Conta da Cloudflare da rede de sites."
  type        = string
}

variable "domain" {
  description = "Domínio principal do site (o primeiro de domains na configuração do Backoffice), sem esquema."
  type        = string

  validation {
    condition     = can(regex("^([a-z0-9]([a-z0-9-]*[a-z0-9])?\\.)+[a-z]{2,}$", var.domain))
    error_message = "Use o domínio em minúsculas, sem esquema nem barra (ex.: exemplo.com.br)."
  }
}

variable "email_forward_to" {
  description = "Caixa central que recebe o e-mail de contato. Precisa já estar criada e verificada na conta (passo manual da ADR 0027)."
  type        = string
}

variable "email_aliases" {
  description = "Endereços locais de contato do site (contato => contato@<domínio>), encaminhados para email_forward_to."
  type        = set(string)
  default     = ["contato"]

  validation {
    condition     = alltrue([for alias in var.email_aliases : can(regex("^[a-z0-9][a-z0-9._-]*$", alias))])
    error_message = "Use só a parte local do endereço, em minúsculas (ex.: contato)."
  }
}

variable "site_id" {
  description = "SITE_ID do Backoffice. Dá nome ao bucket de mídia (media-<SITE_ID>), como em mediaBucket() do Backoffice."
  type        = string

  validation {
    condition     = can(regex("^[a-z0-9][a-z0-9-]*$", var.site_id))
    error_message = "Use o SITE_ID do Backoffice: minúsculas, dígitos e hífen."
  }
}

# Os crawlers "ai-training" de packages/core/src/crawlers.ts, menos Google-Extended e
# Applebot-Extended, que são tokens do robots.txt e não aparecem no user-agent. Revise as duas
# listas juntas a cada trimestre (G4). Busca e busca por IA nunca entram aqui (P10).
variable "training_crawler_user_agents" {
  description = "User-agents de crawlers de treinamento de IA bloqueados pelo WAF da zona (comparação sem diferenciar maiúsculas)."
  type        = list(string)
  default     = ["GPTBot", "ClaudeBot", "CCBot", "Bytespider", "meta-externalagent"]

  validation {
    condition     = length(var.training_crawler_user_agents) > 0 && alltrue([for agent in var.training_crawler_user_agents : can(regex("^[A-Za-z0-9._-]+$", agent))])
    error_message = "Informe ao menos um user-agent, só com letras, dígitos, ponto, sublinhado e hífen."
  }
}

# Folgado de propósito: operadoras móveis põem muitos leitores atrás do mesmo IP (CGNAT). O
# valor real é medido no piloto (seção 9.3 do 05).
variable "events_rate_limit_requests" {
  description = "Requisições a /_e/* por IP e por data center, a cada 10 s, antes do bloqueio."
  type        = number
  default     = 200

  validation {
    condition     = var.events_rate_limit_requests >= 50 && floor(var.events_rate_limit_requests) == var.events_rate_limit_requests
    error_message = "Use um inteiro de pelo menos 50."
  }
}
