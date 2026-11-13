variable "site_id" {
  description = "SITE_ID do Backoffice. Imutável: define a chave do estado (sites/<SITE_ID>.tfstate)."
  type        = string

  validation {
    condition     = can(regex("^[a-z0-9][a-z0-9-]*$", var.site_id))
    error_message = "Use o SITE_ID do Backoffice: minúsculas, dígitos e hífen."
  }
}

variable "cloudflare_account_id" {
  description = "Conta da Cloudflare da rede de sites; também dona do bucket tofu-state."
  type        = string
}

variable "domain" {
  description = "Domínio principal do site, sem esquema."
  type        = string
}

variable "email_forward_to" {
  description = "Caixa central já verificada no Email Routing da conta (ADR 0027)."
  type        = string
}

variable "email_aliases" {
  description = "Endereços locais de contato do site."
  type        = set(string)
  default     = ["contato"]
}

variable "state_passphrase" {
  description = "Senha da cifragem do estado e do plano (TF_VAR_state_passphrase). Nunca em arquivo."
  type        = string
  sensitive   = true

  validation {
    condition     = length(var.state_passphrase) >= 16
    error_message = "A senha do estado precisa de pelo menos 16 caracteres (pbkdf2)."
  }
}
