'use client';
import { useEffect, useRef, useState } from 'react';

/**
 * Garde la page affichée dans l'adresse : elle est lue au chargement (un rafraîchissement ramène au même endroit),
 * écrite à chaque changement, et suit les boutons précédent / suivant du navigateur.
 * Une adresse inconnue est remplacée par celle de la page affichée, sans toucher aux paramètres (?kit=…).
 */
export function usePathRoute<T>(parse: (pathname: string) => T, format: (route: T) => string) {
    const [route, setRoute] = useState<T>(() => parse(window.location.pathname));
    const first = useRef(true);
    useEffect(() => {
        const path = format(route);
        if (window.location.pathname === path) { first.current = false; return; }
        if (first.current) { first.current = false; history.replaceState(null, '', path + window.location.search); }
        else history.pushState(null, '', path);
        // eslint-disable-next-line react-hooks/exhaustive-deps -- format est une fonction pure du module des adresses
    }, [route]);
    useEffect(() => {
        const onPop = () => setRoute(parse(window.location.pathname));
        window.addEventListener('popstate', onPop);
        return () => window.removeEventListener('popstate', onPop);
        // eslint-disable-next-line react-hooks/exhaustive-deps -- parse est une fonction pure du module des adresses
    }, []);
    return [route, setRoute] as const;
}
