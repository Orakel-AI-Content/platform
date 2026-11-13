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
