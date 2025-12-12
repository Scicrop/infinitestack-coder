package com.infinitestack.notebook.dto;

public class RunPythonRequest {

    private String script;
    private String parameter; // opcional

    public RunPythonRequest() {}

    public RunPythonRequest(String script, String parameter) {
        this.script = script;
        this.parameter = parameter;
    }

    public String getScript() {
        return script;
    }

    public void setScript(String script) {
        this.script = script;
    }

    public String getParameter() {
        return parameter;
    }

    public void setParameter(String parameter) {
        this.parameter = parameter;
    }
}
