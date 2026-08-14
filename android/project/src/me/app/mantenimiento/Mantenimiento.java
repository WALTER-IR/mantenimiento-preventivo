package me.app.mantenimiento;

public class Mantenimiento {
    public long id;
    public long equipoId;
    public String prioridad = "";
    public String fechaProgramada = "";
    public String fechaReprogramada = "";
    public String fechaReal = "";
    public String estado = "";
    public String actividades = "";
    public String proxima = "";
    public String observaciones = "";
    // Fecha/hora (yyyy-MM-dd HH:mm:ss) en que el mantenimiento pasó a Finalizado.
    public String finalizadoEn = "";

    // datos del equipo (JOIN)
    public String serie = "";
    public String hostname = "";
    public String ubicacion = "";
    public String usuarioAsignado = "";

    // datos del usuario responsable (JOIN)
    public String usuario = "";
}
