package me.app.mantenimiento;

public class Mantenimiento {
    public long id;
    public long equipoId;
    public String prioridad = "";
    public String fechaProgramada = "";
    public String fechaReprogramada = "";
    public String fechaReal = "";
    public String estado = "";
    public String observaciones = "";

    // datos del equipo (JOIN)
    public String serie = "";
    public String hostname = "";
    public String ubicacion = "";
    public String usuarioAsignado = "";

    // datos del usuario responsable (JOIN)
    public String usuario = "";
}
