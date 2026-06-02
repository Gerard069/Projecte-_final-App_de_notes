# Projecte-_final-App_de_notes

En aquest repositori trobaràs tota la informació, dissenys i esquemes que s'han fet servir per a la creació d'una **App de gestió i rendiment acadèmic** d'alt rendiment. L'aplicació compta amb una interfície nativa inspirada en el disseny minimalista d'iOS i altres sistemes operatius, optimitzada completament per a dispositius mòbils en format de targetes exclusives i navegació fluida amb cantonades redondejades simulant la proporció aurea utilitzada en dissenys de apple per pestanyes i nuvols.

---

## Què és aquest projecte?

Aquesta és una aplicació integral de notes i productivitat per a l'estudiant. La idea principal és centralitzar en un sol lloc l'historial acadèmic, el control del temps i la planificació diària de l'institut o universitat per tal de mantenir un seguiment estricte del curs, potenciar el focus d'estudi i automatitzar el càlcul d'objectius.

---

## Funcions principals

L'app no només serveix per guardar text, sinó que incorpora un ecosistema d'eines interconnectades per controlar el rendiment acadèmic en temps real:

* **Gestió de notes i historial:** Registre dinàmic de qualificacions desglossat per assignatura (0-10) amb sincronització al núvol.
* **Càlcul de mitjana i analítica visual:** L'aplicació computa de forma automàtica la nota mitjana global i genera un gràfic de línia evolutiu gràcies a la integració de `Chart.js` per analitzar la progressió del trimestre.
* **Gestor de tasques pendents:** Llista de control (*To-Do list*) per a deures i exàmens amb un sistema actiu d'eliminació reactiva i funció de recuperació temporal (*Undo Toast*).
* **Pomodoro Timer configurable:** Temporitzador de productivitat per blocs integrat amb intervals ajustables d'estudi i descans per mitigar la procrastinació.
* **Intel·ligència de Chatbot Mentor:** Un assistent virtual interactiu expert en tècniques d'estudi que respon sota demanda oferint mètodes actius (com el Mètode Feynman, Active Recall, Repetició Espaciada o el Palau Mental) adaptats a branques de ciències o lletres.
* **Sistema Dinàmic de Rangs:** Gamificació de l'aprenentatge. Segons la mitjana exacta extreta de cada assignatura, el sistema reconeix el nivell de l'estudiant i li assigna un títol visual i de color codificat:
    * **🛡️ Aprendiz (Nota < 5.0):** Si la nota és baixeta i toca millorar.
    * **⚔️ Guerrero (Nota ≥ 5.0 i < 7.0):** Si estàs lluitant i vas pel bon camí.
    * **🔮 Maestro (Nota ≥ 7.0 i < 9.0):** Domini clar de la matèria amb alt rendiment.
    * **👑 Llegenda (Nota ≥ 9.0):** Si tens notes excel·lents i un rendiment perfecte.

---

## Com s'ha fet

Per muntar tota l'estructura de components i aconseguir que els càlculs funcionin de manera unificada, s'ha utilitzat:

* **Interfície i Disseny (HTML5 & CSS3):** Arquitectura semàntica encasellada en una vista de contenidor mòbil (`375px` x `812px`). Estils basats en variables d'Apple (`:root`), tipografies del sistema, barres de navegació inferiors (*Tab Bar*) amb efecte de desenfocament de fons (*backdrop-filter*) i finestres modals animades.
* **Lògica i Dinàmica (JavaScript ES6):** Motor reactiu que gestiona el canvi de vistes en un sol fitxer (*Single Page Application*), control de comptadors asíncris (`setInterval`) i injecció de plantilles per a les targetes de rangs.
* **Persistència de Dades i Sincronització:** Dualitat tècnica preparada per funcionar de dues maneres:
    1.  **Firebase Firestore:** Integrat de manera nativa amb l'escolta en temps real (`onSnapshot`) per sincronitzar les matèries, notes i tasques a una base de dades externa segons l'identificador d'usuari (`uid`).
    2.  **Entorn Local Alternatiu:** Sistema de contingència automàtic en local i memòria cau (`localStorage`) per si la configuració de Firebase es troba buida.

---

## Objectiu del projecte

Hem fet aquesta app per aprendre a programar coses útils per al dia a dia de l'institut i per tenir una motivació extra amb el sistema de rangs per arribar a ser "Llegenda" a totes les matèries. A mes ens motivarà encara mes si comparem rangs i vilem suoerar als nostres amisc que tinguin la app també.
