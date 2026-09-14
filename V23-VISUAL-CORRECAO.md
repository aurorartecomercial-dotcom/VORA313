# VORA 313 — V23 Visual: correção

Correção da V23: removido CSS duplicado que estava fora da tag `<style>` em `vendedor.html` e, por isso, era exibido como texto no topo da página.

Também foi incrementado o cache do Service Worker para `v24` para evitar que uma instalação anterior continue a servir a versão defeituosa.

Nenhuma alteração foi feita na configuração Firebase ou nas Cloud Functions.
