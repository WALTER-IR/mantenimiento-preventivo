package me.app.mantenimiento;

import org.w3c.dom.Document;
import org.w3c.dom.Element;
import org.w3c.dom.Node;
import org.w3c.dom.NodeList;

import java.io.ByteArrayInputStream;
import java.io.ByteArrayOutputStream;
import java.io.InputStream;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.Map;
import java.util.zip.ZipEntry;
import java.util.zip.ZipInputStream;

import javax.xml.parsers.DocumentBuilderFactory;

public final class XlsxReader {

    private XlsxReader() {
    }

    // Devuelve la primera hoja como filas de celdas (String[]).
    // La fila 0 es la cabecera. Las columnas se alinean por la referencia (A, B, C...).
    public static ArrayList<String[]> read(InputStream in) throws Exception {
        Map<String, byte[]> entries = readZip(in);
        ArrayList<String> shared = parseSharedStrings(entries.get("xl/sharedStrings.xml"));
        String sheetPath = firstSheetPath(entries);
        if (sheetPath == null) sheetPath = "xl/worksheets/sheet1.xml";
        byte[] sheetBytes = entries.get(sheetPath);
        if (sheetBytes == null) {
            for (Map.Entry<String, byte[]> e : entries.entrySet()) {
                if (e.getKey().startsWith("xl/worksheets/")) {
                    sheetBytes = e.getValue();
                    break;
                }
            }
        }
        if (sheetBytes == null) throw new Exception("No se encontró la hoja de cálculo");
        return parseSheet(sheetBytes, shared);
    }

    private static Map<String, byte[]> readZip(InputStream in) throws Exception {
        Map<String, byte[]> map = new HashMap<>();
        ZipInputStream zip = new ZipInputStream(in);
        ZipEntry entry;
        byte[] buf = new byte[8192];
        while ((entry = zip.getNextEntry()) != null) {
            ByteArrayOutputStream bos = new ByteArrayOutputStream();
            int n;
            while ((n = zip.read(buf)) != -1) bos.write(buf, 0, n);
            map.put(entry.getName().replace('\\', '/'), bos.toByteArray());
            zip.closeEntry();
        }
        zip.close();
        return map;
    }

    private static Document parseXml(byte[] data) throws Exception {
        DocumentBuilderFactory f = DocumentBuilderFactory.newInstance();
        f.setNamespaceAware(true);
        return f.newDocumentBuilder().parse(new ByteArrayInputStream(data));
    }

    private static ArrayList<String> parseSharedStrings(byte[] data) throws Exception {
        ArrayList<String> out = new ArrayList<>();
        if (data == null) return out;
        Document doc = parseXml(data);
        NodeList sis = doc.getElementsByTagNameNS("*", "si");
        for (int i = 0; i < sis.getLength(); i++) {
            Element si = (Element) sis.item(i);
            StringBuilder sb = new StringBuilder();
            NodeList ts = si.getElementsByTagNameNS("*", "t");
            for (int j = 0; j < ts.getLength(); j++) {
                sb.append(ts.item(j).getTextContent());
            }
            out.add(sb.toString());
        }
        return out;
    }

    private static String firstSheetPath(Map<String, byte[]> entries) {
        try {
            byte[] wb = entries.get("xl/workbook.xml");
            if (wb == null) return null;
            Document doc = parseXml(wb);
            NodeList sheets = doc.getElementsByTagNameNS("*", "sheet");
            if (sheets.getLength() == 0) return null;
            Element sheet = (Element) sheets.item(0);
            String rid = sheet.getAttribute("r:id");
            if (rid == null || rid.length() == 0) rid = sheet.getAttributeNS(
                    "http://schemas.openxmlformats.org/officeDocument/2006/relationships", "id");
            if (rid == null || rid.length() == 0) return null;

            byte[] rels = entries.get("xl/_rels/workbook.xml.rels");
            if (rels == null) return null;
            Document rd = parseXml(rels);
            NodeList relList = rd.getElementsByTagNameNS("*", "Relationship");
            for (int i = 0; i < relList.getLength(); i++) {
                Element rel = (Element) relList.item(i);
                if (rid.equals(rel.getAttribute("Id"))) {
                    String target = rel.getAttribute("Target");
                    if (target != null && target.length() > 0) {
                        if (target.startsWith("/")) return "xl" + target;
                        return "xl/" + target;
                    }
                }
            }
        } catch (Exception e) {
            // si falla, se intenta sheet1.xml
        }
        return null;
    }

    private static ArrayList<String[]> parseSheet(byte[] data, ArrayList<String> shared) throws Exception {
        ArrayList<String[]> rows = new ArrayList<>();
        Document doc = parseXml(data);
        NodeList rowList = doc.getElementsByTagNameNS("*", "row");
        for (int r = 0; r < rowList.getLength(); r++) {
            Element rowEl = (Element) rowList.item(r);
            NodeList cells = rowEl.getElementsByTagNameNS("*", "c");
            String[] row = null;
            for (int c = 0; c < cells.getLength(); c++) {
                Element cell = (Element) cells.item(c);
                String ref = cell.getAttribute("r");
                int col = colIndex(ref);
                if (col < 0) continue;
                String type = cell.getAttribute("t");
                String val = cellText(cell, type, shared);
                if (row == null) row = new String[col + 1];
                if (row.length <= col) {
                    String[] next = new String[col + 1];
                    System.arraycopy(row, 0, next, 0, row.length);
                    row = next;
                }
                row[col] = val;
            }
            if (row != null) rows.add(row);
        }
        return rows;
    }

    private static String cellText(Element cell, String type, ArrayList<String> shared) {
        // shared string: <v>indice</v>
        if ("s".equals(type)) {
            NodeList vs = cell.getElementsByTagNameNS("*", "v");
            if (vs.getLength() > 0) {
                try {
                    int idx = Integer.parseInt(vs.item(0).getTextContent().trim());
                    if (idx >= 0 && idx < shared.size()) return shared.get(idx);
                } catch (Exception e) {
                    return "";
                }
            }
            return "";
        }
        // inline string: <is><t>...</t></is>
        if ("inlineStr".equals(type)) {
            NodeList ts = cell.getElementsByTagNameNS("*", "t");
            StringBuilder sb = new StringBuilder();
            for (int i = 0; i < ts.getLength(); i++) sb.append(ts.item(i).getTextContent());
            return sb.toString();
        }
        // numero, fecha (serial), formula string, etc.
        NodeList vs = cell.getElementsByTagNameNS("*", "v");
        if (vs.getLength() > 0) return vs.item(0).getTextContent().trim();
        NodeList ts = cell.getElementsByTagNameNS("*", "t");
        if (ts.getLength() > 0) return ts.item(0).getTextContent().trim();
        return "";
    }

    private static int colIndex(String ref) {
        if (ref == null || ref.length() == 0) return -1;
        int idx = 0;
        for (int i = 0; i < ref.length(); i++) {
            char ch = Character.toUpperCase(ref.charAt(i));
            if (ch < 'A' || ch > 'Z') break;
            idx = idx * 26 + (ch - 'A' + 1);
        }
        return idx - 1;
    }
}
