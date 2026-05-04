Leia apenas:
- AGENTS.md da raiz
- apps/web/AGENTS.md
- apps/web/src/components/cad/**
- apps/web/src/state/**
- apps/web/src/styles/**
- packages/cad-core/src/**
- packages/cad-tools/src/**
- packages/cad-renderer/src/**

Não leia o repositório inteiro.

Estamos iniciando o MVP 1.3.2 — CAD Desktop UI Redesign.

Objetivo:
Redesenhar a interface do editor CAD-WEB para ter aparência e experiência inspiradas em softwares CAD profissionais como AutoCAD, SolidWorks, DraftSight e BricsCAD, sem copiar diretamente nenhuma interface específica.

A meta é substituir o visual atual de MVP simples por uma interface mais profissional, técnica e orientada a engenharia.

Diretrizes visuais:
- Tema dark industrial/profissional.
- Estética de software técnico.
- Menus, ribbon/toolbar, painéis dockados, ícones e statusbar profissional.
- Não usar aparência genérica de app web.
- Priorizar clareza, densidade informacional e usabilidade de CAD.

Implementar:

1. Top Menu
Criar uma barra superior com menus:
- Arquivo
- Editar
- Exibir
- Desenhar
- Modificar
- Camadas
- Ferramentas
- Ajuda

Não precisa implementar todos os comportamentos completos agora, mas deve existir a estrutura visual e os itens principais.

2. Ribbon / Toolbar Superior
Criar uma barra superior agrupada com seções:
- Desenhar: Line, Rectangle, Circle
- Modificar: Move, Rotate, Scale, Erase
- Precisão: Snap, Grid (se existir), Ortho placeholder
- Camadas: layer ativa, criar layer, visibilidade, bloqueio
- Arquivo: Import/Export JSON/SVG, Clear

3. Barra lateral esquerda com ícones
Reorganizar a toolbar lateral para usar ícones e labels curtos.
Os botões devem ficar mais compactos e profissionais.
Não usar apenas botões empilhados simples.

4. Painéis laterais dockados
Transformar o painel de Layers em painel lateral direito dockado ou recolhível.
Preparar espaço para futuro painel de propriedades no mesmo lado.
O painel de diagnóstico deve continuar separado e visível apenas em modo dev/flag.

5. Command Line
Melhorar a command line para estilo CAD.
Exibir prompts de ferramenta, por exemplo:
- [Line] Specify first point
- [Move] Select objects
- [Rotate] Specify pivot point
A command line deve ficar visualmente destacada e profissional.

6. Status Bar
Melhorar a statusbar com organização profissional.
Exibir:
- ferramenta ativa
- coordenadas X/Y
- zoom
- layer ativa (nome legível)
- total de entidades
- snap on/off
- modos ativos

7. Ícones
Adicionar ícones coerentes para ferramentas e menus.
Usar biblioteca leve e profissional (por exemplo lucide-react, heroicons ou similar já compatível com o projeto).
Não usar ícones infantis ou genéricos demais.
Manter consistência visual.

8. UX geral
- Melhorar espaçamento, hierarquia e contraste.
- Manter o canvas como foco central.
- Não deixar painéis encobrirem demais a área de desenho.
- Preservar funcionamento de todas as features atuais.

Regras:
- Não quebrar Line, Rectangle, Circle, Move, Rotate, Scale, Select, Erase, Pan, Snap, Layers, Undo/Redo, JSON/SVG e Performance Lab.
- Não refatorar lógica geométrica sem necessidade.
- Focar em UI/UX e estrutura visual.
- Não copiar diretamente a interface de nenhum software proprietário.
- Apenas adotar linguagem visual inspirada em CAD profissional.
- O DiagnosticsPanel deve continuar disponível apenas em DEV ou por flag.
- O resultado deve parecer software CAD profissional, não dashboard web genérico.

Critérios de aceite:
1. npm run dev funciona.
2. npm run test continua funcionando.
3. A interface fica mais próxima de CAD profissional.
4. Existe top menu.
5. Existe ribbon/toolbar superior agrupada.
6. A barra lateral esquerda usa ícones.
7. O painel de layers fica melhor integrado.
8. A statusbar fica mais clara.
9. A command line fica mais profissional.
10. Nenhuma funcionalidade existente é quebrada.

Ao final, responda curto:
- arquivos alterados;
- componentes novos;
- como a interface foi reorganizada;
- como testar;
- próximos passos recomendados.