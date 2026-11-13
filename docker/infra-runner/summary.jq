# Resumo do plano para o infra-plan.json: de `tofu show -json <plano>`, os recursos que mudam.
# `no-op` e `read` ficam fora; duas ações (destruir e criar, em qualquer ordem) viram `replace`.
[
  .resource_changes[]?
  | select(.change.actions != ["no-op"] and .change.actions != ["read"])
  | {
      address,
      type,
      action: (if (.change.actions | length) == 2 then "replace" else .change.actions[0] end)
    }
]
