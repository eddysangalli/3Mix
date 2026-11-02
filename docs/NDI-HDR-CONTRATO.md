# NDI HDR: contrato disponível

Conferência em 09/10/2026, documentação oficial consultada nesta execução.

O SDK NDI v6 padrão pode receber e processar HDR, mas não envia conteúdo com metadados HDR. O envio exige NDI Advanced SDK; sua versão trial limita o envio HDR a 30 minutos. Portanto não basta trocar o FourCC por P216/PA16 ou anexar XML ao runtime padrão para declarar a saída HDR operacional.

Fontes oficiais: [HDR e diferenças de SDK](https://docs.ndi.video/all/developing-with-ndi/sdk/hdr), [capacidades do Advanced SDK](https://docs.ndi.video/all/faq/sdk/what-are-the-differences-between-the-ndi-sdk-and-the-ndi-advanced-sdk).

Contrato a implementar depois de fornecido o SDK/licença: view de alta precisão; buffer P216 limitado, ou PA16 se houver alpha; metadados `ndi_color_info` com primárias/matriz BT.2020 e transferência PQ/HLG; timestamp comum de Fill/Key/áudio; conferência em receptor HDR configurado para alta precisão. Recepção em 8 bits não faz mapeamento HDR→SDR automático pelo SDK.

A integração 3Mix atual recusa NDI HDR explicitamente. OMT HDR P216 manual tem implementação e prova próprias; SDI HDR está sendo implementado pelo contrato DeckLink. Não atribuir essas provas ao envio NDI HDR.
