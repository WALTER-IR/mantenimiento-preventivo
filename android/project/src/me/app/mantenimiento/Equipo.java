package me.app.mantenimiento;

public class Equipo {
    public long id;
    public long usuarioId;

    // propietario físico del equipo (USUARIO ASIGNADO en la carga masiva)
    public String usuarioAsignado = "";

    // atributos del equipo
    public String hostname = "";
    public String ip = "";
    public String ubicacion = "";
    public String equipo = "";
    public String codInventario = "";
    public String serie = "";
    public String marca = "";
    public String modelo = "";
    public String contrato = "";
    public String status = "";

    // datos del responsable (JOIN usuarios)
    public String responsable = "";
    public String zona = "";
    public String subdivision = "";
    public String dni = "";
    public String ceco = "";
    public String area = "";
    public String cargo = "";
    public String email = "";
}
