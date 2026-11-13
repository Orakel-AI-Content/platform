# Raiz aplicada uma vez por site, com um estado por site (ADR 0027). Credenciais só pelo
# ambiente: CLOUDFLARE_API_TOKEN (provider), AWS_ACCESS_KEY_ID e AWS_SECRET_ACCESS_KEY (token S3
# do R2 para o tofu-state) e TF_VAR_state_passphrase (cifragem).
terraform {
  required_version = "~> 1.13.0"

  required_providers {
    cloudflare = {
      source  = "cloudflare/cloudflare"
      version = "5.28.1"
    }
  }

  # Variáveis no backend: avaliação antecipada do OpenTofu (>= 1.8). Chave por SITE_ID.
  backend "s3" {
    bucket = "tofu-state"
    key    = "sites/${var.site_id}.tfstate"
    region = "auto"
    endpoints = {
      s3 = "https://${var.cloudflare_account_id}.r2.cloudflarestorage.com"
    }
    use_lockfile = true

    # O R2 não é a AWS: sem região, conta, checksum novo nem metadados da EC2.
    use_path_style              = true
    skip_credentials_validation = true
    skip_region_validation      = true
    skip_requesting_account_id  = true
    skip_metadata_api_check     = true
    skip_s3_checksum            = true
  }

  # Estado e plano sempre cifrados: sem a senha, o init e o plan falham em vez de gravar em claro.
  encryption {
    key_provider "pbkdf2" "state" {
      passphrase = var.state_passphrase
    }

    method "aes_gcm" "state" {
      keys = key_provider.pbkdf2.state
    }

    state {
      method   = method.aes_gcm.state
      enforced = true
    }

    plan {
      method   = method.aes_gcm.state
      enforced = true
    }
  }
}

provider "cloudflare" {}
