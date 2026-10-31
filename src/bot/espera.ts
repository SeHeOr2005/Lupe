/**
 * Después de aprobar una convocatoria, el bot queda esperando su pliego en ese
 * chat. Si la persona manda el PDF sin "Responder" a ningún mensaje, se asocia a
 * la última convocatoria aprobada ahí, mientras no haya pasado demasiado tiempo.
 * Vive en memoria: si el bot se reinicia, basta con responder a la tarjeta.
 */
export class EsperaDeDocumentos {
  private readonly esperando = new Map<number, { convocatoriaId: string; hasta: number }>();

  constructor(
    private readonly vigenciaMs = 2 * 60 * 60 * 1000, // 2 horas
    private readonly ahora: () => number = Date.now,
  ) {}

  /** El chat acaba de aprobar esta convocatoria: lo próximo que mande sin responder es para ella. */
  marcar(chatId: number, convocatoriaId: string) {
    this.esperando.set(chatId, { convocatoriaId, hasta: this.ahora() + this.vigenciaMs });
  }

  /** La convocatoria que el chat tiene pendiente de documentos, si aún está vigente. */
  para(chatId: number): string | undefined {
    const e = this.esperando.get(chatId);
    if (!e) return undefined;
    if (this.ahora() > e.hasta) {
      this.esperando.delete(chatId);
      return undefined;
    }
    return e.convocatoriaId;
  }
}
