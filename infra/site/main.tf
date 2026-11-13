module "site" {
  source = "../modules/site"

  account_id       = var.cloudflare_account_id
  domain           = var.domain
  email_forward_to = var.email_forward_to
  email_aliases    = var.email_aliases
}
