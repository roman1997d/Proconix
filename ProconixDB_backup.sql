--
-- PostgreSQL database dump
--

\restrict 86768XG0kd0hujyjpaS3nqnJGaeyF21HgmAQc5fgVB1A6sDrFckeC1xuAD8A3J3

-- Dumped from database version 14.20 (Homebrew)
-- Dumped by pg_dump version 14.20 (Homebrew)

SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SELECT pg_catalog.set_config('search_path', '', false);
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = off;

--
-- Name: project_status; Type: TYPE; Schema: public; Owner: postgres
--

CREATE TYPE public.project_status AS ENUM (
    'active',
    'completed',
    'on_hold'
);


ALTER TYPE public.project_status OWNER TO postgres;

SET default_tablespace = '';

SET default_table_access_method = heap;

--
-- Name: companies; Type: TABLE; Schema: public; Owner: pg_database_owner
--

CREATE TABLE public.companies (
    id integer NOT NULL,
    name character varying(255) NOT NULL,
    industry_type character varying(100),
    subscription_plan character varying(100),
    active character varying(20) DEFAULT 'not_active'::character varying,
    created_at timestamp without time zone DEFAULT now(),
    created_by_manager_id integer,
    security_question1 character varying(255),
    security_token1 character varying(255),
    office_address character varying(255),
    created_by character varying(255),
    plan_purchased_at timestamp with time zone,
    plan_expires_at timestamp with time zone,
    payment_method character varying(80),
    billing_status character varying(40)
);


ALTER TABLE public.companies OWNER TO pg_database_owner;

--
-- Name: COLUMN companies.plan_purchased_at; Type: COMMENT; Schema: public; Owner: pg_database_owner
--

COMMENT ON COLUMN public.companies.plan_purchased_at IS 'When the current plan was purchased or started.';


--
-- Name: COLUMN companies.plan_expires_at; Type: COMMENT; Schema: public; Owner: pg_database_owner
--

COMMENT ON COLUMN public.companies.plan_expires_at IS 'When the current plan period ends (renewal / expiry).';


--
-- Name: COLUMN companies.payment_method; Type: COMMENT; Schema: public; Owner: pg_database_owner
--

COMMENT ON COLUMN public.companies.payment_method IS 'e.g. registration, card, invoice, manual, free';


--
-- Name: COLUMN companies.billing_status; Type: COMMENT; Schema: public; Owner: pg_database_owner
--

COMMENT ON COLUMN public.companies.billing_status IS 'paid_active | unpaid_suspended | unpaid_active';


--
-- Name: companies_id_seq; Type: SEQUENCE; Schema: public; Owner: pg_database_owner
--

CREATE SEQUENCE public.companies_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER TABLE public.companies_id_seq OWNER TO pg_database_owner;

--
-- Name: companies_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: pg_database_owner
--

ALTER SEQUENCE public.companies_id_seq OWNED BY public.companies.id;


--
-- Name: manager; Type: TABLE; Schema: public; Owner: pg_database_owner
--

CREATE TABLE public.manager (
    id integer NOT NULL,
    company_id integer NOT NULL,
    name character varying(255) NOT NULL,
    surname character varying(255),
    active boolean DEFAULT true,
    email character varying(255) NOT NULL,
    password text NOT NULL,
    created_at timestamp without time zone DEFAULT now(),
    project_onboard_name character varying(255),
    active_status boolean DEFAULT true,
    deactivation_date timestamp without time zone,
    deactivated_by_manager_id integer,
    is_head_manager character varying(10) DEFAULT 'No'::character varying
);


ALTER TABLE public.manager OWNER TO pg_database_owner;

--
-- Name: manager_id_seq; Type: SEQUENCE; Schema: public; Owner: pg_database_owner
--

CREATE SEQUENCE public.manager_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER TABLE public.manager_id_seq OWNER TO pg_database_owner;

--
-- Name: manager_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: pg_database_owner
--

ALTER SEQUENCE public.manager_id_seq OWNED BY public.manager.id;


--
-- Name: material_categories; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.material_categories (
    id integer NOT NULL,
    company_id integer NOT NULL,
    name character varying(255) NOT NULL,
    description text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    created_by_id integer NOT NULL,
    created_by_name character varying(255) NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_by_id integer,
    updated_by_name character varying(255),
    deleted_at timestamp with time zone,
    deleted_by_id integer,
    deleted_by_name character varying(255)
);


ALTER TABLE public.material_categories OWNER TO postgres;

--
-- Name: material_categories_id_seq; Type: SEQUENCE; Schema: public; Owner: postgres
--

CREATE SEQUENCE public.material_categories_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER TABLE public.material_categories_id_seq OWNER TO postgres;

--
-- Name: material_categories_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: postgres
--

ALTER SEQUENCE public.material_categories_id_seq OWNED BY public.material_categories.id;


--
-- Name: material_consumption; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.material_consumption (
    id integer NOT NULL,
    material_id integer NOT NULL,
    project_id integer NOT NULL,
    company_id integer NOT NULL,
    snapshot_date date NOT NULL,
    quantity_remaining numeric(18,4) NOT NULL,
    recorded_at timestamp with time zone DEFAULT now()
);


ALTER TABLE public.material_consumption OWNER TO postgres;

--
-- Name: material_consumption_id_seq; Type: SEQUENCE; Schema: public; Owner: postgres
--

CREATE SEQUENCE public.material_consumption_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER TABLE public.material_consumption_id_seq OWNER TO postgres;

--
-- Name: material_consumption_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: postgres
--

ALTER SEQUENCE public.material_consumption_id_seq OWNED BY public.material_consumption.id;


--
-- Name: material_suppliers; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.material_suppliers (
    id integer NOT NULL,
    company_id integer NOT NULL,
    name character varying(255) NOT NULL,
    contact character varying(255),
    email_phone character varying(255),
    address text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    created_by_id integer NOT NULL,
    created_by_name character varying(255) NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_by_id integer,
    updated_by_name character varying(255),
    deleted_at timestamp with time zone,
    deleted_by_id integer,
    deleted_by_name character varying(255)
);


ALTER TABLE public.material_suppliers OWNER TO postgres;

--
-- Name: material_suppliers_id_seq; Type: SEQUENCE; Schema: public; Owner: postgres
--

CREATE SEQUENCE public.material_suppliers_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER TABLE public.material_suppliers_id_seq OWNER TO postgres;

--
-- Name: material_suppliers_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: postgres
--

ALTER SEQUENCE public.material_suppliers_id_seq OWNED BY public.material_suppliers.id;


--
-- Name: materials; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.materials (
    id integer NOT NULL,
    project_id integer NOT NULL,
    company_id integer NOT NULL,
    name character varying(255) NOT NULL,
    category_id integer,
    supplier_id integer,
    unit character varying(50) DEFAULT 'kg'::character varying NOT NULL,
    quantity_initial numeric(18,4) DEFAULT 0 NOT NULL,
    quantity_used numeric(18,4) DEFAULT 0 NOT NULL,
    quantity_remaining numeric(18,4) DEFAULT 0 NOT NULL,
    low_stock_threshold numeric(18,4),
    status character varying(20) DEFAULT 'normal'::character varying NOT NULL,
    email_notify boolean DEFAULT false NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    created_by_id integer NOT NULL,
    created_by_name character varying(255) NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_by_id integer,
    updated_by_name character varying(255),
    deleted_at timestamp with time zone,
    deleted_by_id integer,
    deleted_by_name character varying(255),
    CONSTRAINT materials_low_stock_threshold_check CHECK (((low_stock_threshold IS NULL) OR (low_stock_threshold >= (0)::numeric))),
    CONSTRAINT materials_quantity_initial_check CHECK ((quantity_initial >= (0)::numeric)),
    CONSTRAINT materials_quantity_remaining_check CHECK ((quantity_remaining >= (0)::numeric)),
    CONSTRAINT materials_quantity_used_check CHECK ((quantity_used >= (0)::numeric)),
    CONSTRAINT materials_status_check CHECK (((status)::text = ANY ((ARRAY['normal'::character varying, 'low'::character varying, 'out'::character varying])::text[])))
);


ALTER TABLE public.materials OWNER TO postgres;

--
-- Name: materials_id_seq; Type: SEQUENCE; Schema: public; Owner: postgres
--

CREATE SEQUENCE public.materials_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER TABLE public.materials_id_seq OWNER TO postgres;

--
-- Name: materials_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: postgres
--

ALTER SEQUENCE public.materials_id_seq OWNED BY public.materials.id;


--
-- Name: operative_task_photos; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.operative_task_photos (
    id integer NOT NULL,
    user_id integer NOT NULL,
    task_source character varying(20) NOT NULL,
    task_id integer NOT NULL,
    file_url character varying(500) NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT operative_task_photos_task_source_check CHECK (((task_source)::text = ANY ((ARRAY['legacy'::character varying, 'planning'::character varying])::text[])))
);


ALTER TABLE public.operative_task_photos OWNER TO postgres;

--
-- Name: TABLE operative_task_photos; Type: COMMENT; Schema: public; Owner: postgres
--

COMMENT ON TABLE public.operative_task_photos IS 'Confirmation photos uploaded by operatives for assigned tasks (max 10 per user/task enforced in API).';


--
-- Name: operative_task_photos_id_seq; Type: SEQUENCE; Schema: public; Owner: postgres
--

CREATE SEQUENCE public.operative_task_photos_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER TABLE public.operative_task_photos_id_seq OWNER TO postgres;

--
-- Name: operative_task_photos_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: postgres
--

ALTER SEQUENCE public.operative_task_photos_id_seq OWNED BY public.operative_task_photos.id;


--
-- Name: planning_plan_tasks; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.planning_plan_tasks (
    id integer NOT NULL,
    plan_id integer NOT NULL,
    title character varying(255) NOT NULL,
    description text,
    assigned_to text[] DEFAULT '{}'::text[] NOT NULL,
    priority character varying(20) DEFAULT 'medium'::character varying NOT NULL,
    deadline timestamp with time zone NOT NULL,
    pickup_start_date date NOT NULL,
    notes text,
    status character varying(20) DEFAULT 'not_started'::character varying NOT NULL,
    send_to_assignees boolean DEFAULT true NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    qa_job_id integer,
    CONSTRAINT planning_plan_tasks_priority_check CHECK (((priority)::text = ANY ((ARRAY['low'::character varying, 'medium'::character varying, 'high'::character varying, 'critical'::character varying])::text[]))),
    CONSTRAINT planning_plan_tasks_status_check CHECK (((status)::text = ANY ((ARRAY['not_started'::character varying, 'in_progress'::character varying, 'paused'::character varying, 'completed'::character varying, 'declined'::character varying])::text[])))
);


ALTER TABLE public.planning_plan_tasks OWNER TO postgres;

--
-- Name: planning_plan_tasks_id_seq; Type: SEQUENCE; Schema: public; Owner: postgres
--

CREATE SEQUENCE public.planning_plan_tasks_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER TABLE public.planning_plan_tasks_id_seq OWNER TO postgres;

--
-- Name: planning_plan_tasks_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: postgres
--

ALTER SEQUENCE public.planning_plan_tasks_id_seq OWNED BY public.planning_plan_tasks.id;


--
-- Name: planning_plans; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.planning_plans (
    id integer NOT NULL,
    company_id integer NOT NULL,
    type character varying(20) NOT NULL,
    start_date date NOT NULL,
    end_date date NOT NULL,
    created_by integer,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT planning_plans_type_check CHECK (((type)::text = ANY ((ARRAY['daily'::character varying, 'weekly'::character varying, 'monthly'::character varying])::text[])))
);


ALTER TABLE public.planning_plans OWNER TO postgres;

--
-- Name: planning_plans_id_seq; Type: SEQUENCE; Schema: public; Owner: postgres
--

CREATE SEQUENCE public.planning_plans_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER TABLE public.planning_plans_id_seq OWNER TO postgres;

--
-- Name: planning_plans_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: postgres
--

ALTER SEQUENCE public.planning_plans_id_seq OWNED BY public.planning_plans.id;


--
-- Name: proconix_admin; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.proconix_admin (
    id integer NOT NULL,
    full_name character varying(255) NOT NULL,
    email character varying(255) NOT NULL,
    password_hash character varying(255) NOT NULL,
    address text,
    enroll_date date NOT NULL,
    admin_rank character varying(50) DEFAULT 'admin'::character varying NOT NULL,
    access_level character varying(80) DEFAULT 'full_acces'::character varying NOT NULL,
    active boolean DEFAULT true NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


ALTER TABLE public.proconix_admin OWNER TO postgres;

--
-- Name: TABLE proconix_admin; Type: COMMENT; Schema: public; Owner: postgres
--

COMMENT ON TABLE public.proconix_admin IS 'Proconix platform operators; authenticate via dedicated admin API (bcrypt password_hash).';


--
-- Name: proconix_admin_id_seq; Type: SEQUENCE; Schema: public; Owner: postgres
--

CREATE SEQUENCE public.proconix_admin_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER TABLE public.proconix_admin_id_seq OWNER TO postgres;

--
-- Name: proconix_admin_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: postgres
--

ALTER SEQUENCE public.proconix_admin_id_seq OWNED BY public.proconix_admin.id;


--
-- Name: project_assignments; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.project_assignments (
    id integer NOT NULL,
    project_id integer NOT NULL,
    user_id integer NOT NULL,
    role character varying(100),
    assigned_at timestamp without time zone DEFAULT now()
);


ALTER TABLE public.project_assignments OWNER TO postgres;

--
-- Name: project_assignments_id_seq; Type: SEQUENCE; Schema: public; Owner: postgres
--

CREATE SEQUENCE public.project_assignments_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER TABLE public.project_assignments_id_seq OWNER TO postgres;

--
-- Name: project_assignments_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: postgres
--

ALTER SEQUENCE public.project_assignments_id_seq OWNED BY public.project_assignments.id;


--
-- Name: projects; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.projects (
    id integer NOT NULL,
    company_id integer NOT NULL,
    project_pass_key character varying(255),
    created_by_who character varying(255),
    project_name character varying(255),
    address text,
    start_date date,
    planned_end_date date,
    number_of_floors integer,
    description text,
    active boolean DEFAULT true,
    created_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
    deactivate_by_who character varying(255),
    latitude numeric(9,6),
    longitude numeric(9,6)
);


ALTER TABLE public.projects OWNER TO postgres;

--
-- Name: projects_id_seq; Type: SEQUENCE; Schema: public; Owner: postgres
--

CREATE SEQUENCE public.projects_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER TABLE public.projects_id_seq OWNER TO postgres;

--
-- Name: projects_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: postgres
--

ALTER SEQUENCE public.projects_id_seq OWNED BY public.projects.id;


--
-- Name: qa_cost_types; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.qa_cost_types (
    id integer NOT NULL,
    code character varying(50) NOT NULL,
    label character varying(255) NOT NULL
);


ALTER TABLE public.qa_cost_types OWNER TO postgres;

--
-- Name: qa_cost_types_id_seq; Type: SEQUENCE; Schema: public; Owner: postgres
--

CREATE SEQUENCE public.qa_cost_types_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER TABLE public.qa_cost_types_id_seq OWNER TO postgres;

--
-- Name: qa_cost_types_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: postgres
--

ALTER SEQUENCE public.qa_cost_types_id_seq OWNED BY public.qa_cost_types.id;


--
-- Name: qa_floors; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.qa_floors (
    id integer NOT NULL,
    project_id integer,
    code character varying(50) NOT NULL,
    label character varying(255) NOT NULL,
    sort_order integer DEFAULT 0
);


ALTER TABLE public.qa_floors OWNER TO postgres;

--
-- Name: qa_floors_id_seq; Type: SEQUENCE; Schema: public; Owner: postgres
--

CREATE SEQUENCE public.qa_floors_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER TABLE public.qa_floors_id_seq OWNER TO postgres;

--
-- Name: qa_floors_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: postgres
--

ALTER SEQUENCE public.qa_floors_id_seq OWNED BY public.qa_floors.id;


--
-- Name: qa_job_statuses; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.qa_job_statuses (
    id integer NOT NULL,
    code character varying(50) NOT NULL,
    label character varying(255) NOT NULL
);


ALTER TABLE public.qa_job_statuses OWNER TO postgres;

--
-- Name: qa_job_statuses_id_seq; Type: SEQUENCE; Schema: public; Owner: postgres
--

CREATE SEQUENCE public.qa_job_statuses_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER TABLE public.qa_job_statuses_id_seq OWNER TO postgres;

--
-- Name: qa_job_statuses_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: postgres
--

ALTER SEQUENCE public.qa_job_statuses_id_seq OWNED BY public.qa_job_statuses.id;


--
-- Name: qa_job_templates; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.qa_job_templates (
    id integer NOT NULL,
    job_id integer NOT NULL,
    template_id integer NOT NULL,
    created_at timestamp without time zone DEFAULT now()
);


ALTER TABLE public.qa_job_templates OWNER TO postgres;

--
-- Name: qa_job_templates_id_seq; Type: SEQUENCE; Schema: public; Owner: postgres
--

CREATE SEQUENCE public.qa_job_templates_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER TABLE public.qa_job_templates_id_seq OWNER TO postgres;

--
-- Name: qa_job_templates_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: postgres
--

ALTER SEQUENCE public.qa_job_templates_id_seq OWNED BY public.qa_job_templates.id;


--
-- Name: qa_job_user_workers; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.qa_job_user_workers (
    job_id integer NOT NULL,
    user_id integer NOT NULL,
    created_at timestamp without time zone DEFAULT now()
);


ALTER TABLE public.qa_job_user_workers OWNER TO postgres;

--
-- Name: qa_job_workers; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.qa_job_workers (
    id integer NOT NULL,
    job_id integer NOT NULL,
    worker_id integer NOT NULL,
    created_at timestamp without time zone DEFAULT now()
);


ALTER TABLE public.qa_job_workers OWNER TO postgres;

--
-- Name: qa_job_workers_id_seq; Type: SEQUENCE; Schema: public; Owner: postgres
--

CREATE SEQUENCE public.qa_job_workers_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER TABLE public.qa_job_workers_id_seq OWNER TO postgres;

--
-- Name: qa_job_workers_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: postgres
--

ALTER SEQUENCE public.qa_job_workers_id_seq OWNED BY public.qa_job_workers.id;


--
-- Name: qa_jobs; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.qa_jobs (
    id integer NOT NULL,
    project_id integer NOT NULL,
    job_number character varying(50) NOT NULL,
    floor_id integer,
    floor_code character varying(50),
    location character varying(500),
    sqm character varying(100),
    linear_meters character varying(100),
    specification character varying(500),
    description text,
    target_completion_date date,
    cost_included boolean DEFAULT false,
    cost_type_id integer,
    cost_value character varying(100),
    responsible_id integer,
    status_id integer NOT NULL,
    created_at timestamp without time zone DEFAULT now(),
    created_by character varying(255),
    updated_at timestamp without time zone,
    updated_by character varying(255),
    responsible_user_id integer
);


ALTER TABLE public.qa_jobs OWNER TO postgres;

--
-- Name: qa_jobs_id_seq; Type: SEQUENCE; Schema: public; Owner: postgres
--

CREATE SEQUENCE public.qa_jobs_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER TABLE public.qa_jobs_id_seq OWNER TO postgres;

--
-- Name: qa_jobs_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: postgres
--

ALTER SEQUENCE public.qa_jobs_id_seq OWNED BY public.qa_jobs.id;


--
-- Name: qa_supervisors; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.qa_supervisors (
    id integer NOT NULL,
    company_id integer NOT NULL,
    name character varying(500) NOT NULL,
    created_at timestamp without time zone DEFAULT now()
);


ALTER TABLE public.qa_supervisors OWNER TO postgres;

--
-- Name: qa_supervisors_id_seq; Type: SEQUENCE; Schema: public; Owner: postgres
--

CREATE SEQUENCE public.qa_supervisors_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER TABLE public.qa_supervisors_id_seq OWNER TO postgres;

--
-- Name: qa_supervisors_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: postgres
--

ALTER SEQUENCE public.qa_supervisors_id_seq OWNED BY public.qa_supervisors.id;


--
-- Name: qa_template_steps; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.qa_template_steps (
    id integer NOT NULL,
    template_id integer NOT NULL,
    sort_order integer DEFAULT 0 NOT NULL,
    description text,
    price_per_m2 character varying(100),
    price_per_unit character varying(100),
    price_per_linear character varying(100),
    step_external_id character varying(100),
    created_at timestamp without time zone DEFAULT now()
);


ALTER TABLE public.qa_template_steps OWNER TO postgres;

--
-- Name: qa_template_steps_id_seq; Type: SEQUENCE; Schema: public; Owner: postgres
--

CREATE SEQUENCE public.qa_template_steps_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER TABLE public.qa_template_steps_id_seq OWNER TO postgres;

--
-- Name: qa_template_steps_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: postgres
--

ALTER SEQUENCE public.qa_template_steps_id_seq OWNED BY public.qa_template_steps.id;


--
-- Name: qa_templates; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.qa_templates (
    id integer NOT NULL,
    name character varying(500) NOT NULL,
    created_at timestamp without time zone DEFAULT now(),
    created_by character varying(255),
    updated_at timestamp without time zone,
    updated_by character varying(255),
    company_id integer,
    project_id integer
);


ALTER TABLE public.qa_templates OWNER TO postgres;

--
-- Name: qa_templates_id_seq; Type: SEQUENCE; Schema: public; Owner: postgres
--

CREATE SEQUENCE public.qa_templates_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER TABLE public.qa_templates_id_seq OWNER TO postgres;

--
-- Name: qa_templates_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: postgres
--

ALTER SEQUENCE public.qa_templates_id_seq OWNED BY public.qa_templates.id;


--
-- Name: qa_worker_categories; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.qa_worker_categories (
    id integer NOT NULL,
    code character varying(50) NOT NULL,
    label character varying(255) NOT NULL
);


ALTER TABLE public.qa_worker_categories OWNER TO postgres;

--
-- Name: qa_worker_categories_id_seq; Type: SEQUENCE; Schema: public; Owner: postgres
--

CREATE SEQUENCE public.qa_worker_categories_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER TABLE public.qa_worker_categories_id_seq OWNER TO postgres;

--
-- Name: qa_worker_categories_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: postgres
--

ALTER SEQUENCE public.qa_worker_categories_id_seq OWNED BY public.qa_worker_categories.id;


--
-- Name: qa_workers; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.qa_workers (
    id integer NOT NULL,
    company_id integer NOT NULL,
    name character varying(500) NOT NULL,
    category_id integer NOT NULL,
    created_at timestamp without time zone DEFAULT now()
);


ALTER TABLE public.qa_workers OWNER TO postgres;

--
-- Name: qa_workers_id_seq; Type: SEQUENCE; Schema: public; Owner: postgres
--

CREATE SEQUENCE public.qa_workers_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER TABLE public.qa_workers_id_seq OWNER TO postgres;

--
-- Name: qa_workers_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: postgres
--

ALTER SEQUENCE public.qa_workers_id_seq OWNED BY public.qa_workers.id;


--
-- Name: site_snag_custom_category; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.site_snag_custom_category (
    company_id integer NOT NULL,
    name character varying(255) NOT NULL
);


ALTER TABLE public.site_snag_custom_category OWNER TO postgres;

--
-- Name: site_snag_drawings; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.site_snag_drawings (
    id character varying(80) NOT NULL,
    company_id integer NOT NULL,
    project_id integer NOT NULL,
    name character varying(500) DEFAULT ''::character varying NOT NULL,
    block character varying(200) DEFAULT '—'::character varying NOT NULL,
    floor character varying(200) DEFAULT '—'::character varying NOT NULL,
    image_data text,
    pixels_to_mm double precision DEFAULT 1 NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


ALTER TABLE public.site_snag_drawings OWNER TO postgres;

--
-- Name: site_snag_highlights; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.site_snag_highlights (
    id character varying(80) NOT NULL,
    drawing_id character varying(80) NOT NULL,
    payload jsonb NOT NULL,
    sort_order integer DEFAULT 0 NOT NULL
);


ALTER TABLE public.site_snag_highlights OWNER TO postgres;

--
-- Name: site_snag_measurements; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.site_snag_measurements (
    id character varying(80) NOT NULL,
    drawing_id character varying(80) NOT NULL,
    payload jsonb NOT NULL,
    sort_order integer DEFAULT 0 NOT NULL
);


ALTER TABLE public.site_snag_measurements OWNER TO postgres;

--
-- Name: site_snag_prefs; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.site_snag_prefs (
    company_id integer NOT NULL,
    show_archived boolean DEFAULT false NOT NULL
);


ALTER TABLE public.site_snag_prefs OWNER TO postgres;

--
-- Name: site_snag_removed_preset; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.site_snag_removed_preset (
    company_id integer NOT NULL,
    preset_name character varying(255) NOT NULL
);


ALTER TABLE public.site_snag_removed_preset OWNER TO postgres;

--
-- Name: site_snags; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.site_snags (
    id character varying(80) NOT NULL,
    drawing_id character varying(80) NOT NULL,
    nx double precision NOT NULL,
    ny double precision NOT NULL,
    title character varying(1000) DEFAULT ''::character varying NOT NULL,
    description text,
    status character varying(50) DEFAULT 'open'::character varying NOT NULL,
    category character varying(255),
    assignee_user_id integer,
    assignee_manager_id integer,
    assignee_display character varying(500),
    target_date date,
    mock_planning_task_id character varying(100),
    archived boolean DEFAULT false NOT NULL,
    photos_before jsonb DEFAULT '[]'::jsonb NOT NULL,
    photos_after jsonb DEFAULT '[]'::jsonb NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT site_snags_one_assignee CHECK (((assignee_user_id IS NULL) OR (assignee_manager_id IS NULL)))
);


ALTER TABLE public.site_snags OWNER TO postgres;

--
-- Name: tasks; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.tasks (
    id integer NOT NULL,
    user_id integer NOT NULL,
    project_id integer,
    name character varying(255) NOT NULL,
    deadline date,
    status character varying(50) DEFAULT 'pending'::character varying,
    created_at timestamp without time zone DEFAULT now()
);


ALTER TABLE public.tasks OWNER TO postgres;

--
-- Name: tasks_id_seq; Type: SEQUENCE; Schema: public; Owner: postgres
--

CREATE SEQUENCE public.tasks_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER TABLE public.tasks_id_seq OWNER TO postgres;

--
-- Name: tasks_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: postgres
--

ALTER SEQUENCE public.tasks_id_seq OWNED BY public.tasks.id;


--
-- Name: users; Type: TABLE; Schema: public; Owner: pg_database_owner
--

CREATE TABLE public.users (
    id integer NOT NULL,
    company_id integer NOT NULL,
    project_id integer,
    role character varying(50) NOT NULL,
    name character varying(255) NOT NULL,
    email character varying(255) NOT NULL,
    password text NOT NULL,
    active boolean DEFAULT true,
    created_at timestamp without time zone DEFAULT now(),
    active_status boolean DEFAULT true,
    deactivation_date timestamp without time zone,
    deactivated_by_manager_id integer,
    onboarding character varying(10) DEFAULT 'no'::character varying,
    onboarded boolean DEFAULT false
);


ALTER TABLE public.users OWNER TO pg_database_owner;

--
-- Name: COLUMN users.onboarded; Type: COMMENT; Schema: public; Owner: pg_database_owner
--

COMMENT ON COLUMN public.users.onboarded IS 'TRUE after operative has set their password (first login done).';


--
-- Name: users_id_seq; Type: SEQUENCE; Schema: public; Owner: pg_database_owner
--

CREATE SEQUENCE public.users_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER TABLE public.users_id_seq OWNER TO pg_database_owner;

--
-- Name: users_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: pg_database_owner
--

ALTER SEQUENCE public.users_id_seq OWNED BY public.users.id;


--
-- Name: work_hours; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.work_hours (
    id integer NOT NULL,
    user_id integer NOT NULL,
    project_id integer,
    clock_in timestamp without time zone DEFAULT now() NOT NULL,
    clock_out timestamp without time zone,
    clock_in_latitude numeric(9,6),
    clock_in_longitude numeric(9,6),
    clock_out_latitude numeric(9,6),
    clock_out_longitude numeric(9,6)
);


ALTER TABLE public.work_hours OWNER TO postgres;

--
-- Name: work_hours_id_seq; Type: SEQUENCE; Schema: public; Owner: postgres
--

CREATE SEQUENCE public.work_hours_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER TABLE public.work_hours_id_seq OWNER TO postgres;

--
-- Name: work_hours_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: postgres
--

ALTER SEQUENCE public.work_hours_id_seq OWNED BY public.work_hours.id;


--
-- Name: work_logs; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.work_logs (
    id integer NOT NULL,
    company_id integer NOT NULL,
    submitted_by_user_id integer,
    project_id integer,
    job_display_id character varying(50) NOT NULL,
    worker_name character varying(255) NOT NULL,
    project character varying(255),
    block character varying(100),
    floor character varying(100),
    apartment character varying(100),
    zone character varying(100),
    work_type character varying(255),
    quantity numeric(12,2),
    unit_price numeric(12,2),
    total numeric(12,2),
    status character varying(50) DEFAULT 'pending'::character varying NOT NULL,
    description text,
    submitted_at timestamp with time zone DEFAULT now(),
    work_was_edited boolean DEFAULT false,
    edit_history jsonb DEFAULT '[]'::jsonb,
    photo_urls jsonb DEFAULT '[]'::jsonb,
    invoice_file_path character varying(500),
    archived boolean DEFAULT false,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now(),
    timesheet_jobs jsonb DEFAULT '[]'::jsonb,
    operative_archived boolean DEFAULT false,
    operative_archived_at timestamp with time zone
);


ALTER TABLE public.work_logs OWNER TO postgres;

--
-- Name: TABLE work_logs; Type: COMMENT; Schema: public; Owner: postgres
--

COMMENT ON TABLE public.work_logs IS 'Jobs submitted by operatives; managers view, edit, approve, archive.';


--
-- Name: COLUMN work_logs.job_display_id; Type: COMMENT; Schema: public; Owner: postgres
--

COMMENT ON COLUMN public.work_logs.job_display_id IS 'Display id e.g. WL-001 (unique per company).';


--
-- Name: COLUMN work_logs.edit_history; Type: COMMENT; Schema: public; Owner: postgres
--

COMMENT ON COLUMN public.work_logs.edit_history IS 'Array of { field, oldVal, newVal, editor, at }.';


--
-- Name: COLUMN work_logs.photo_urls; Type: COMMENT; Schema: public; Owner: postgres
--

COMMENT ON COLUMN public.work_logs.photo_urls IS 'Array of photo URLs.';


--
-- Name: work_logs_id_seq; Type: SEQUENCE; Schema: public; Owner: postgres
--

CREATE SEQUENCE public.work_logs_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER TABLE public.work_logs_id_seq OWNER TO postgres;

--
-- Name: work_logs_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: postgres
--

ALTER SEQUENCE public.work_logs_id_seq OWNED BY public.work_logs.id;


--
-- Name: companies id; Type: DEFAULT; Schema: public; Owner: pg_database_owner
--

ALTER TABLE ONLY public.companies ALTER COLUMN id SET DEFAULT nextval('public.companies_id_seq'::regclass);


--
-- Name: manager id; Type: DEFAULT; Schema: public; Owner: pg_database_owner
--

ALTER TABLE ONLY public.manager ALTER COLUMN id SET DEFAULT nextval('public.manager_id_seq'::regclass);


--
-- Name: material_categories id; Type: DEFAULT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.material_categories ALTER COLUMN id SET DEFAULT nextval('public.material_categories_id_seq'::regclass);


--
-- Name: material_consumption id; Type: DEFAULT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.material_consumption ALTER COLUMN id SET DEFAULT nextval('public.material_consumption_id_seq'::regclass);


--
-- Name: material_suppliers id; Type: DEFAULT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.material_suppliers ALTER COLUMN id SET DEFAULT nextval('public.material_suppliers_id_seq'::regclass);


--
-- Name: materials id; Type: DEFAULT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.materials ALTER COLUMN id SET DEFAULT nextval('public.materials_id_seq'::regclass);


--
-- Name: operative_task_photos id; Type: DEFAULT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.operative_task_photos ALTER COLUMN id SET DEFAULT nextval('public.operative_task_photos_id_seq'::regclass);


--
-- Name: planning_plan_tasks id; Type: DEFAULT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.planning_plan_tasks ALTER COLUMN id SET DEFAULT nextval('public.planning_plan_tasks_id_seq'::regclass);


--
-- Name: planning_plans id; Type: DEFAULT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.planning_plans ALTER COLUMN id SET DEFAULT nextval('public.planning_plans_id_seq'::regclass);


--
-- Name: proconix_admin id; Type: DEFAULT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.proconix_admin ALTER COLUMN id SET DEFAULT nextval('public.proconix_admin_id_seq'::regclass);


--
-- Name: project_assignments id; Type: DEFAULT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.project_assignments ALTER COLUMN id SET DEFAULT nextval('public.project_assignments_id_seq'::regclass);


--
-- Name: projects id; Type: DEFAULT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.projects ALTER COLUMN id SET DEFAULT nextval('public.projects_id_seq'::regclass);


--
-- Name: qa_cost_types id; Type: DEFAULT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.qa_cost_types ALTER COLUMN id SET DEFAULT nextval('public.qa_cost_types_id_seq'::regclass);


--
-- Name: qa_floors id; Type: DEFAULT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.qa_floors ALTER COLUMN id SET DEFAULT nextval('public.qa_floors_id_seq'::regclass);


--
-- Name: qa_job_statuses id; Type: DEFAULT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.qa_job_statuses ALTER COLUMN id SET DEFAULT nextval('public.qa_job_statuses_id_seq'::regclass);


--
-- Name: qa_job_templates id; Type: DEFAULT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.qa_job_templates ALTER COLUMN id SET DEFAULT nextval('public.qa_job_templates_id_seq'::regclass);


--
-- Name: qa_job_workers id; Type: DEFAULT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.qa_job_workers ALTER COLUMN id SET DEFAULT nextval('public.qa_job_workers_id_seq'::regclass);


--
-- Name: qa_jobs id; Type: DEFAULT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.qa_jobs ALTER COLUMN id SET DEFAULT nextval('public.qa_jobs_id_seq'::regclass);


--
-- Name: qa_supervisors id; Type: DEFAULT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.qa_supervisors ALTER COLUMN id SET DEFAULT nextval('public.qa_supervisors_id_seq'::regclass);


--
-- Name: qa_template_steps id; Type: DEFAULT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.qa_template_steps ALTER COLUMN id SET DEFAULT nextval('public.qa_template_steps_id_seq'::regclass);


--
-- Name: qa_templates id; Type: DEFAULT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.qa_templates ALTER COLUMN id SET DEFAULT nextval('public.qa_templates_id_seq'::regclass);


--
-- Name: qa_worker_categories id; Type: DEFAULT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.qa_worker_categories ALTER COLUMN id SET DEFAULT nextval('public.qa_worker_categories_id_seq'::regclass);


--
-- Name: qa_workers id; Type: DEFAULT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.qa_workers ALTER COLUMN id SET DEFAULT nextval('public.qa_workers_id_seq'::regclass);


--
-- Name: tasks id; Type: DEFAULT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.tasks ALTER COLUMN id SET DEFAULT nextval('public.tasks_id_seq'::regclass);


--
-- Name: users id; Type: DEFAULT; Schema: public; Owner: pg_database_owner
--

ALTER TABLE ONLY public.users ALTER COLUMN id SET DEFAULT nextval('public.users_id_seq'::regclass);


--
-- Name: work_hours id; Type: DEFAULT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.work_hours ALTER COLUMN id SET DEFAULT nextval('public.work_hours_id_seq'::regclass);


--
-- Name: work_logs id; Type: DEFAULT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.work_logs ALTER COLUMN id SET DEFAULT nextval('public.work_logs_id_seq'::regclass);


--
-- Data for Name: companies; Type: TABLE DATA; Schema: public; Owner: pg_database_owner
--

COPY public.companies (id, name, industry_type, subscription_plan, active, created_at, created_by_manager_id, security_question1, security_token1, office_address, created_by, plan_purchased_at, plan_expires_at, payment_method, billing_status) FROM stdin;
13	Dex	Carpentry	Free	not_active	2026-03-22 19:55:13.050316	\N	masha	SOF493	43 Leigh Road	Martin Zaea	2026-03-22 19:55:13.046+00	2026-04-21 13:00:00+01	free	unpaid_active
12	Akmer	Drylining	1 month	active	2026-03-22 14:18:18.883452	\N	dog	UUX305	7 Thornfield Grove	Roman Demian	\N	2026-04-22 13:00:00+01	bank_transfer	paid_active
\.


--
-- Data for Name: manager; Type: TABLE DATA; Schema: public; Owner: pg_database_owner
--

COPY public.manager (id, company_id, name, surname, active, email, password, created_at, project_onboard_name, active_status, deactivation_date, deactivated_by_manager_id, is_head_manager) FROM stdin;
13	12	Roman	Demian	t	rdemian732@gmail.com	$2b$10$L8DIU7UaDjJq/VUdACcgkOTbFdrD1qcuZoCdxKIG.u1PAroxMycSe	2026-03-22 14:18:29.076848	\N	t	\N	\N	Yes
14	13	Martin	Kelly	t	martin@dex.com	$2b$10$bwsvCZXGnLTXTp3qDH5YnePjaXw.fRvc9Pj5thjYXFuK18ZUhaTsa	2026-03-22 19:55:38.877853	\N	t	\N	\N	Yes
\.


--
-- Data for Name: material_categories; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.material_categories (id, company_id, name, description, created_at, created_by_id, created_by_name, updated_at, updated_by_id, updated_by_name, deleted_at, deleted_by_id, deleted_by_name) FROM stdin;
6	12	Filler	\N	2026-03-22 14:25:03.97917+00	13	Roman Demian	2026-03-22 14:25:03.97917+00	\N	\N	\N	\N	\N
7	12	Board	\N	2026-03-22 14:25:10.599783+00	13	Roman Demian	2026-03-22 14:25:10.599783+00	\N	\N	\N	\N	\N
8	13	Plasterboard	\N	2026-03-22 20:02:40.429274+00	14	Martin Kelly	2026-03-22 20:02:40.429274+00	\N	\N	\N	\N	\N
9	13	Timber	\N	2026-03-22 20:02:48.767314+00	14	Martin Kelly	2026-03-22 20:02:48.767314+00	\N	\N	\N	\N	\N
10	13	Metal	\N	2026-03-22 20:02:57.45298+00	14	Martin Kelly	2026-03-22 20:02:57.45298+00	\N	\N	\N	\N	\N
11	13	Filler	\N	2026-03-22 20:03:03.053293+00	14	Martin Kelly	2026-03-22 20:03:03.053293+00	\N	\N	\N	\N	\N
\.


--
-- Data for Name: material_consumption; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.material_consumption (id, material_id, project_id, company_id, snapshot_date, quantity_remaining, recorded_at) FROM stdin;
18	11	8	12	2026-03-22	100.0000	2026-03-22 14:25:35.948472+00
20	13	9	13	2026-03-22	200.0000	2026-03-22 20:04:50.264265+00
21	14	9	13	2026-03-22	70.0000	2026-03-22 20:05:26.504472+00
19	12	9	13	2026-03-22	50.0000	2026-03-22 20:05:48.156649+00
\.


--
-- Data for Name: material_suppliers; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.material_suppliers (id, company_id, name, contact, email_phone, address, created_at, created_by_id, created_by_name, updated_at, updated_by_id, updated_by_name, deleted_at, deleted_by_id, deleted_by_name) FROM stdin;
5	12	B&Q	Martin	\N	\N	2026-03-22 14:24:49.734666+00	13	Roman Demian	2026-03-22 14:24:49.734666+00	\N	\N	\N	\N	\N
6	13	B&Q	John	john@b&q.com	\N	2026-03-22 20:03:22.68102+00	14	Martin Kelly	2026-03-22 20:03:22.68102+00	\N	\N	\N	\N	\N
7	13	CCF	Anton	\N	\N	2026-03-22 20:03:35.61887+00	14	Martin Kelly	2026-03-22 20:03:35.61887+00	\N	\N	\N	\N	\N
\.


--
-- Data for Name: materials; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.materials (id, project_id, company_id, name, category_id, supplier_id, unit, quantity_initial, quantity_used, quantity_remaining, low_stock_threshold, status, email_notify, created_at, created_by_id, created_by_name, updated_at, updated_by_id, updated_by_name, deleted_at, deleted_by_id, deleted_by_name) FROM stdin;
11	8	12	promixLite	6	5	pcs	100.0000	0.0000	100.0000	20.0000	normal	t	2026-03-22 14:25:35.945426+00	13	Roman Demian	2026-03-22 14:25:35.945426+00	\N	\N	\N	\N	\N
13	9	13	FireBoard 12mm	8	6	pcs	200.0000	0.0000	200.0000	40.0000	normal	t	2026-03-22 20:04:50.261977+00	14	Martin Kelly	2026-03-22 20:04:50.261977+00	\N	\N	\N	\N	\N
14	9	13	50mm Timber	9	7	l	70.0000	0.0000	70.0000	5.0000	normal	f	2026-03-22 20:05:26.502308+00	14	Martin Kelly	2026-03-22 20:05:26.502308+00	\N	\N	\N	\N	\N
12	9	13	EasyFill	\N	7	pcs	50.0000	0.0000	50.0000	10.0000	normal	t	2026-03-22 20:04:15.961495+00	14	Martin Kelly	2026-03-22 20:05:48.155805+00	14	Martin Kelly	\N	\N	\N
\.


--
-- Data for Name: operative_task_photos; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.operative_task_photos (id, user_id, task_source, task_id, file_url, created_at) FROM stdin;
\.


--
-- Data for Name: planning_plan_tasks; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.planning_plan_tasks (id, plan_id, title, description, assigned_to, priority, deadline, pickup_start_date, notes, status, send_to_assignees, created_at, qa_job_id) FROM stdin;
29	7	J-000001	Floor: 3 • Location: Towe A ,  floor 3 , apt 304 • Target: Sat Mar 28	{"George Dume Dume"}	medium	2026-03-25 12:00:00+00	2026-03-23	\N	not_started	t	2026-03-22 20:15:42.621145+00	\N
27	6	cx cx		{"John Mc'Onik"}	medium	2026-03-26 12:00:00+00	2026-03-23	\N	not_started	t	2026-03-22 18:56:39.112915+00	\N
30	7	Tape and Joint Sockets	tape and joint sokets on lvl 2 , every apartment 1st coat and 2nd coat	{"Roman Demian"}	high	2026-03-24 12:00:00+00	2026-03-23	\N	not_started	t	2026-03-22 20:15:42.621145+00	\N
\.


--
-- Data for Name: planning_plans; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.planning_plans (id, company_id, type, start_date, end_date, created_by, created_at) FROM stdin;
6	12	weekly	2026-03-23	2026-03-26	13	2026-03-22 18:56:39.107439+00
7	13	daily	2026-03-28	2026-03-28	14	2026-03-22 20:12:52.330365+00
\.


--
-- Data for Name: proconix_admin; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.proconix_admin (id, full_name, email, password_hash, address, enroll_date, admin_rank, access_level, active, created_at, updated_at) FROM stdin;
1	Roman Demian	rdemian732@gmail.com	$2b$10$S1ud.V5oneXqZvcOgzYx7uvmTe9wskfpniWCEmBuBHqdpRz6MdL.u	Manchester, Salford	2026-03-22	admin	full_acces	t	2026-03-22 13:27:25.75363+00	2026-03-25 23:49:48.451144+00
\.


--
-- Data for Name: project_assignments; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.project_assignments (id, project_id, user_id, role, assigned_at) FROM stdin;
20	8	17	Dryliner	2026-03-22 21:35:10.780627
\.


--
-- Data for Name: projects; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.projects (id, company_id, project_pass_key, created_by_who, project_name, address, start_date, planned_end_date, number_of_floors, description, active, created_at, deactivate_by_who, latitude, longitude) FROM stdin;
8	12	Q23QARZ9E5	Roman Demian	Victoria Riverside	manchester, Salford	2026-02-02	2026-12-30	15	200 New exclusive apartaments	t	2026-03-22 14:21:14.052844	\N	\N	\N
9	13	YYV3B56ABB	Martin Kelly	SaVoy Homes	London , Liverpool Street	2026-03-02	2026-09-16	12	new homes for everyone	t	2026-03-22 20:01:51.221634	\N	53.535965	-2.425080
\.


--
-- Data for Name: qa_cost_types; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.qa_cost_types (id, code, label) FROM stdin;
1	day	Day work
2	hour	Hour work
3	price	Price work
\.


--
-- Data for Name: qa_floors; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.qa_floors (id, project_id, code, label, sort_order) FROM stdin;
1	\N	ground	Ground	0
2	\N	1	Floor 1	1
3	\N	2	Floor 2	2
4	\N	3	Floor 3	3
\.


--
-- Data for Name: qa_job_statuses; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.qa_job_statuses (id, code, label) FROM stdin;
1	new	New
2	active	Active
3	completed	Completed
\.


--
-- Data for Name: qa_job_templates; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.qa_job_templates (id, job_id, template_id, created_at) FROM stdin;
9	18	11	2026-03-22 20:12:52.309872
\.


--
-- Data for Name: qa_job_user_workers; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.qa_job_user_workers (job_id, user_id, created_at) FROM stdin;
18	19	2026-03-22 20:12:52.311514
\.


--
-- Data for Name: qa_job_workers; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.qa_job_workers (id, job_id, worker_id, created_at) FROM stdin;
\.


--
-- Data for Name: qa_jobs; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.qa_jobs (id, project_id, job_number, floor_id, floor_code, location, sqm, linear_meters, specification, description, target_completion_date, cost_included, cost_type_id, cost_value, responsible_id, status_id, created_at, created_by, updated_at, updated_by, responsible_user_id) FROM stdin;
18	9	J-000001	4	3	Towe A ,  floor 3 , apt 304	230	\N	\N	\N	2026-03-28	t	3	1500	\N	1	2026-03-22 20:12:52.307959	Martin Kelly	\N	\N	\N
\.


--
-- Data for Name: qa_supervisors; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.qa_supervisors (id, company_id, name, created_at) FROM stdin;
\.


--
-- Data for Name: qa_template_steps; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.qa_template_steps (id, template_id, sort_order, description, price_per_m2, price_per_unit, price_per_linear, step_external_id, created_at) FROM stdin;
2	1	0		4			step_1771542580129_02c5my6	2026-02-19 23:16:03.808059
5	4	0					step_1771545281762_mbc90tj	2026-02-19 23:54:49.724516
6	5	0					step_1771730170662_tjbcf6f	2026-02-22 03:16:16.677945
7	6	0					step_1771730189932_sj3w76y	2026-02-22 03:16:37.854569
13	11	0	Instal HeadTrack and FloorTrack			5	step_1774210096344_ak0pf1m	2026-03-22 20:11:06.693523
14	11	1	Install I-Studs on every 600mm		4		step_1774210139444_f8ux4o2	2026-03-22 20:11:06.696257
15	11	2	Install Playwood	8			step_1774210204063_76gwzpy	2026-03-22 20:11:06.697938
16	11	3	Insulation	1.5			step_1774210219975_qbtxvyf	2026-03-22 20:11:06.698931
17	11	4	Plasterboard 12 mm ,X2 skins	3			step_1774210233751_9mkeqey	2026-03-22 20:11:06.700794
\.


--
-- Data for Name: qa_templates; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.qa_templates (id, name, created_at, created_by, updated_at, updated_by, company_id, project_id) FROM stdin;
1	metal frame partition	2026-02-19 23:09:49.797681	Roman Demian	2026-02-19 23:16:03.805064	Roman Demian	\N	\N
4	qwqwq	2026-02-19 23:54:49.722759	Roman Demian	\N	\N	\N	\N
5	test belarus	2026-02-22 03:16:16.676633	Marius Marius	\N	\N	\N	\N
6	marius@gmail.com	2026-02-22 03:16:37.853671	Marius Marius	\N	\N	\N	\N
11	Partition Walls	2026-03-22 20:11:06.688546	Martin Kelly	\N	\N	13	9
\.


--
-- Data for Name: qa_worker_categories; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.qa_worker_categories (id, code, label) FROM stdin;
1	fixers	Fixers
2	plaster	Plaster
3	electricians	Electricians
4	painters	Painters
\.


--
-- Data for Name: qa_workers; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.qa_workers (id, company_id, name, category_id, created_at) FROM stdin;
\.


--
-- Data for Name: site_snag_custom_category; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.site_snag_custom_category (company_id, name) FROM stdin;
\.


--
-- Data for Name: site_snag_drawings; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.site_snag_drawings (id, company_id, project_id, name, block, floor, image_data, pixels_to_mm, created_at, updated_at) FROM stdin;
6516bf23-37f9-45ae-885e-6ded913074d6	12	8	Floor 3	a	—	data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAnUAAAIWCAAAAAAU/CR8AABDJ0lEQVR42u19/4skx5Xn5xX961iT7vtpTitMlww7SEsbTe1o0bUMGrCyJO8PXlame+TlEMhYqrnFsLZXs+7RYhZLI9XsWQZjT/cYC4TZU/egPXZZtsfdOpDAVSdOUs9SxdrMglWNENr5qVota/6Adz9kVlVWVn6JyIyIjKzO+GGmOjMyvrz4xIv3Xrx4QYwqVclwqlUkqFKFuipVqKtSlSrUValCXZWqVKGuShXqqlSlCnVVqlBXpQp1VapShboqVairUpUq1FWpQl2VqlShrkoV6qpUpQp1VapQV6UKdVWqUoW6KlWoq1KVKtRVqUJdvkRUDUWFOtOgm5zKJVQArFBnCHRMMz+rVKFON6cLYK2CXYU6k8ur/7uCXYU6Q6Bjmv5dpQp1RjgdqkW2Ql1xoKtgV6HOEOimgVbBrkKdYU5XwW6+E2WOmpgfFByqnBD6uwJeSRKbQl0FiCplht2COYDP4pansMs0K9pV8WtLsWDKfrBQbGuDBmIKwazyCJjbtGDTLCGukFahzrw0wJXweBxS5dVZpQp1VapQV6UqVairUoW6KlWpQl2VypLUWE60WTi0mk5Ybw2svQOFJi4adWQjpgSqZ61N0Fx80Ym4YNTF4Z7YXuqMHVo4WxmpfZsunvQzELMjkGs+Gd+biNnRn/VyyoUoU+Ml5p9AonAi+dYnk4BtIWfB2gSz0GPOwxo457wg8QawCBeYyTXabo7cdpZrvRgJCiTnHOuwKuUnzklmwa+Ps6NDZTkpRP/jRMavaiaRLRO5cLnOPjVegfAi8jGlP+LMfYo536mUpArFuwJQZ1azJW24DfRDYIRmnlDUo6wUYgMDoHDYClhhWamAU5x0xLpGiNRSSKZxhoRNc6ij6f8pExWSPyYVMCRhVJMm7M+4trI4ZbJ1jqLrprKjjuJ1eZawTHC6is85iRZV4+wRSeKpnDqFBo4sXo+pKbtkaaVcJwQyxRKfwvhQTPqEnAKFYo4vVKv0vWATjew8h+iF1wt2Ro2+y1mUB9bLEgyNhd4VNp9QbQnqAks2EaXI25QOOkp9UjoSlcByIsoRdBqMMo2wXz/lmmc80wvO3i8zJCJWjXfr9iaoIKYvoA6NNxQkmROl9ILVcbGSLMDVjpj+AWUzE9UcS7BcrhPoR7RyGCM9kQYakVD+6VWGKfkTUoFxYYMcp+dS0U6FFuSanSwkzh9KinayJixW1XoV28KKnJVIXTuZlXHtuVxh58CHiPMy7umlwzKy1WyjbuFyE5mZCiSmK+ZkdVIYNqetWWUlVlWTjR4+07H6wDy74cEloZDtqOPyw3m8sZbXLT6d2VA5x8I61BWxUisO8BmJNmkIsiUzqEJdHgxwAptgpcOo3VmB2PjXheNcvzYhZ3rLaJGbMlll29dMaVCoUPFjZF5uiqWMrGdWzE4HCSst8Q2P2WQmoQG1i9exiscxrzmwqCr2q0t67G0SS3AMFtpVEvNp4egMnEihzCQgzldkoZYTrYIyheyXPApvbEw8V1ydRYKenqbUCmq8ZkAwKSfZZImd5TRsDiwyHbPWWl4rcg6RunEw0WQqQBanjICTphIdB9QpZA6sdahnYJcCOtJHIukA9SzRUD42qNM4emqvIBvtoRMRsek5UPwMJ9WjYxx1KYaUkC1EmydRYoM41uTAzNINIslmi/ZZZGM/YUsk3j+K0o8mcclQJ+XDBI42dbGOBiW4/HIeTjLjSkWZykp4TMJlCZXN2vm1bSssF1k1lbSP5ohG84m6CIpmpCnJ29DZPP3tgwYZwPccn5tg/aWTlRBVHH5PQ+NrJZmBhrVYUjtCXEqeqW/21oprvG565xGKWdd3lPAFFTdzDWO/uBW2tG5lpHTuSc1LbYKn4bFYKAxbnJQhW0h2jT2g6LhHoXYJepSK9XksO2YL2skJNUoEmKcyoi6bpYu42Lk4W7XKUOeQNFkqoHemkP6cICBzue6bMMRNyar7QgqWJuImMWeGctl2xNKbTHLzm81IworPneWlkKq2F6NCW2ivkx2iZJqSorlgEMMhSY6o+LYTKY1YvGADrJSzGTLpZ2leS2bTY0EcUKsUVF+sXKcm/CUTOBhHf4pXsGTo/+3XJo+eWgu87198ag1N7E5/1T2xrF0KIw3zUkr2pMmRYO8iSC416lgN3UI+P7nK+mhv8vtc8MWdvXPAXij39vmOcs2BqeCx0N/A4k4mEjLEzieBOiZhvuQCZXn/PcfM3Eabmfm54PvTnSciMBqzGJEgKcJ3FQj46Ym536l15VOdrDmZKB89JuZum4m3r9pQ3Isr4sUIW83CuTl9hZWxHGZ0fGbduostK6wSXZfzlBkzQt3XD3DuiSVfrvPSwas3ceaxFaD5Af5qsb1cOLGIpUgkv+aPZwMr0SZKdx6WdMnU0V9feHgDhxcb28CdvdFyul2/fIjLD28XRpzs+7OcbSwCB0aYy3MKu6z+klc23OHu+x2cPwgos+ed3vu7w8b5Lna/hR/vLpskjrbplTwWzErd2stgJVZuJBBPLzv/axFYuYr/OXl2DVeXgcXr+KnmmWTuI9PUnpdIYhLCjkTqHrmLAHAWAV73Ju7uAgCub+cZvST7WLqFIvbrUhjGFywDAbGCx/Ltii3IM9ktBQ11AzwcDxcWfhwbWAlhJZwimjgTLo1YpkHRHxtzUjCHOrWBdce3e+VeHZIV3w/9/+vBhx1VloiIy4sjzSs0e2iJhSgkZ7Zigelcgh2xsoehPIX3vZUW904eNvZPLQE4/Ma5lfwECl/IGud6R6HYZQKDzwpZBI31XyU7YqZvrytXtK0ld38bAF7AU5OHX8c6ALy692F+i8nU5VBE8YoiczDYBREbFeCIORAmi3NviZnWJlgHSfQ1t/3e+X9/7LOf7DUCfgBPv3H9029/7leXne8BwOs4vZiDFjTmHJSuvNPY65+IS72OcMYU/DKukMyFZ04QbgTYt3hGvfT3YZm55wJw1ofMHbT97MMWALg9Zh44QCeBQMn0hdc6L6dw9/zsyEoQ6XH26wq0Epgef9laKHs8tHTZ07RqJCqe+/wiXkY5uH1qafIbKwBweOvUErqj3xhl6GKSdbZiSom+Pr78k0VVfBqf4Rl/IUNfaZmMwDTZEQu0N0/Y+zlDnTiZE1GnrGJK3j2dvBalURBqxPKjKj0WHrzD2gTlQ52JvYkEf+yJU5K5SxJ16DcklYlmSCMMBg4XInlJotR2GE3JYROlJvdErRlmPKET+TzpVSTVWGpoi+OpLJWJx6xOHgw8oQzHXj/Aqi5JjNQD8pOrZt/gxObM5ELAtkI1YMSlLGfimJRybaM+F/bsw6qV/spgVqBsPeeAAYX19JlmTNJqcWoP6o7ZbVoTeVz+UrLR6Rlt5E8XbCjAqKnEqCuCI9owz3L0KL+pOOH7lHMAFFjxmSTbsVB2ZCmHYXP048yL269NnU0E1j7dBfoXz7zYRE6/dcrDqSbMLi/s5COfRfVEuh2FezqRVIBvAxGgxj5NJ/HR3tTZRFy5DgB39oA9PJ88VhzV8Gm7rhovrWxRpYTHhCkSehzWb+RgpwZ1lH1a5T3IFTV+nEfq9T4+aOBy+E3/4vhnfSCkZ4ZK5QhWl/v4ubxGERNtLKEQgXPhUrBTZDmJ3cSzQHoSaluYjqtH/7CEu3BP8Nk3PSe7UziJe7GSZ+XinHsigSO/GYicoWaaJPGZph1145GjXF9bo0Ff2199HLgPpwPPLu2/BgBYch7AuZGX53bzEgBcaW5LdZJH1wzklcvYCEVJhJHIwE6Jzwl0uItAs/9KglPI0HGGzDwMupN0sO7n7g140BvlrGOHuYP6UNrnBHm6FVE4VHvrRFfk+6CMnwV+w6zPiRZjG7Fek0nC9vyVi+3nQo8OH3Tej8rdfdj5Hb541FsOt1Rg9x+cuVvEMONiNxNOx/c3ocDGCslushRtOREwGGVUbHOkw5edp8PPXhn0IvOutC/+7SdHm8sZxKZc0h1J3f+ikkQcb/URnQcW8zo9FAwFHIts+rVnW1dnWFr7uZjcf7wPd1eKlaroizE+N8PreIa/ESQjwilEXbzxh3JPymwxxJPLCsEikPuP9ycL5qWbAM5854v19+Om142vordsKeooOtKJhJEviLqxo1086oyvsOIGOeFlNfJx0kkV4swWwsnjg/36BEU39wDg1aMjb89iJmwi8APgm+/DpiRrkBP2KE3VuwXxZ0SuUxvHPylQkZJl5z2sTv5oPw/gxC03NveV/fWjjSvPFb0airK8XEbp6CWNpDuqXq4rzdnD2CXw0uWtNeGp3P9S/d1pHVZ4hSU2Jdfl8jBIletGyrT4QlvTOK3yqkq5LJ45wH8Td4uru9/Ea4uL/4BvHto3rXTVFBEWlEjKs72mvDmk6HAc5aNbDkJ/APFD/a/sr64Aj6/uv4LjkmhmaAiS+5/KV9iIy6c4dwVmV9huLOpm33S9Q9iHt2bexBSvyvatVFYkMR02uKJS+D55Iyt+EuqIFcAnj+VeqGuFn0xUgTpVxkth1I00ihm5Tibsjt2+xJyNajEBiotTJaXCfGXQK1NrJKEL82KBk7KxP4qAIkzgckdNjDFOx1qpisIdZ5pTeSZmJosci8IzBpMsOo/KH6tTKHqgca2xaD6qFsTi9xMRzwPqSP+lY0Uvv1ZZRcxUUTumNKUCBs/obLWaSRiJc0L20ZGLHyHZK6dCw5v8MRcCQ9EFo4YqRZBqzT+feLBGdO8VAF1qTt521z5PtNYF0KTuleAbmeEl4jxRLyW/ZYtAZzvqSIo7KZvP29e9//uN6602Ll4IvX34zbV26/rDN2S5DAX/zxUayb9dKXTvXebri0Uv21MlGi8UgHTldgHV8/nas/6Pi0edFTzX3HhyauPhgvP2MvDMl/7iEwC4Hydl+xAwvObyQg96tk2f0CQVhGNJ3i3ek5p2hJQuHaw92/B/7TVWALTxU5zCmdH7Ps4uA1hePeriDE79VzwgTSFSNEO965jlxkJ+QRA7dCrTpYU8XS6haidAmgt7rR/+FwDAe/g6ACw7b2IJfzR6v/yJ9//nAfwRloD7s6lYrKAbMaAT73Hya9J0MiPfCit4NEjfYSYdBS/tPO7/+sgH1Nm9CO5xuI3TWFvLxON54luXhzaE3M44yduGLNwMM3FOKOmoUKHqZ+78wYM6nxtprbNeKH971FrM1XTKO9eEgtqw5GTlTF2RnDq1zP02Cjky8olMurDR+GFOzFFe9NkhSWfguAvZJ5vJPqf7j1CuwxnSy9yFjcZuTlaXGW5jVpdZwFAxdEzZJ3gtR7fNaxcUH26YhRsU4YAdOwyf+f+vAMCVcXSZw2Yy6EicS8gzO0qKZ5jUZ4rPbXgtqSkDHRQFXknW4TPN6ETX5oQi78FvAAB7TkiRaO61IkEn41fLQUU0A/VJzskLcWHYsktz2UN31ZSBzuKUtcFn8RYA9PEoAOA5n8SHzf3W1cUknV5ykZKBXeCsa3mj5daOAehkloWpDEvu3jaAi/jLqTzf2G9flZRCkxUKCdhNwn3aqsVp0SaEQFecSYVYDg/Jqf3e+V9/4eeD1pTd5MYe3nrLe70sSAJOlTyE5/Ks1UQnG2A7UCfUxQK5Yc7DEqHcy2+/tIF6KKrYb8axi58XU/GSJDsa3c4lHLeEUm7vLsNCJdmM6YhIUbMt2nU+Q2+LOJmoclBEzogFz/iJnNfyTjaQiujrIvqKNyOQetSoyOg6YgqbsQlSEk4wHrHUoy5jJsdxuxKK2s/al6yaLHqsUgRirVMZolWQ4bb77eSA9SLJoW0c0MGP5RVlduScvSJToyvL64SuNFVx9D9dZKOEmwGlouET653Z8Va0afbmwS5tPfMbS7NVRA0IK2imBTrsRJyleAavI6IwKy0xWASrbahE1VG7eASh+7xTEEYMi41cC1mGn6JHSX9I7KmKWCn3oXTnjFTVQAlH8fzSp8xynLF/1lpWF7IOGZER47gxwkXrkXIXtyqKasSY3lsro/usBtTRZE6aVGL1q535Ar3LcEKWK4vm67huln1Y8nd8baBEXrXNmPauOipuns5S6VA3pcEXYi5BtLNS6ghRypXOxInDyvnHMded0jGdJAX0JDKMSlnUEbOa2ZvP5CAnn/v/cY4qgkNCWTlZrtBOMR9nuXMyTXrVPrILsqAzJ2QVKN+JWyjmI8VvA+e7kVCpNpFFdmG9USXLGllagwSZiZwsDUgyhzq2K+6gfTxXAR6Is4+vIpuhbZYTuxxY5X3piS2HKufiIgqi4hLrp4n8jphNsGNpWHLCSkGpRjIqoluklUKJX+gaanl7HZfJVJ5r89u4ahdTbfrcKpsYkWUftgBup+SSxOk/aHqI08KFqNj8FWyn+IWGszgVDMkOsXMI9vC6rNwuF4/MYw+LcXuSNHSpHICkdlK+mgUNnGy8z7lRV65Fdl4T5VpZix3BbPY6Ji6VfULUAVVAq8vHdzJGw4nJmCvgYpEqfMboOtFO/mSrYJvvYJvaPUBDFCLJvEZZSNa9CSaKjJ6vePEl1j4PWVNeEmVQSnontNlgzeq0oGRCad4F5QIIp7siUstBOU9NXCLUcfy0plhhUDkWKP7UKeW5PTLmMIWgCSc9WGHmmZTrurpMZdnG64zPHY5cSUSdldLvGAucMudom4NC+0U2cim+rq4Q3qcBdaRTkGZTH3O+HcySqVKG0xzdrUNqR0g+eD7b1x9Lq16wZWbld7/THvcjuo+pV25nPTlm0a3Kc8vrNJ1msbBpJVgqea5QR8bqYWMd4hKNti1Les1om3lO5uokyOY8ibhcQtRZL3QInnKkPGWJnT2k8s86y7QJe5NmQ1eCQsNlm6DHRpsovewyfx6/+ppshtf5t0WfeWwl8nX/4pkX9VOw6DBHMVVvv/bUmk8FtJcv3dwFDv7j8Wny+DnS08GrN09+bW2W8ktf/soiADSnCZ1WMuvyI+KMafqWi9TMfmpFvu7AZfMJEGm69uLbaDMzc8/BFrML5p7TDpGnLVhnz4HrTBF5TPl6j5k5RGjxkhH+LTX+4WRqhWVm5h1nY/uYrbvCqf/I0dYa0O4Ad46yFnLxqLf7u/rGwQzlO6uDRw4AdNpT+U93nihEVzEq1z1+Fb+2ATlkn87ngw7LK3lK2cMyFu/F7ZkXK9uto3UAK9M3ZCyuLBWiFZvVJj4HBwC6F5rNK96EPLjUbAb4X7+5faO5dgM4vNZsXvBfTLI3tw8uNZvXgO215oWDzDC0T4ccgQ6Xmrj0V/h5cxvA9lpzzSfBwYVm85ovB641164dAthu4sZac60bKMbFNRx+4JyOqOGHuH4ANC9NfddvbgOXLuFac0TO7oXm2o1+c1vzuqBOrksoy381bKDDzC3AbcDpMfOWg0YDjbG40UEDjfom9xzUXQfucJJ9i5mx6tRdB+stuHU4gyThI/AXonNFCl6Tl0iVb5IfJ8h1CH7SRtuX6ZiZXfB6A3V3i4cNOG4dLY8odddBwyOh49bRGDK30ULDBdaDchradWcncphcbHlyXeC7DtrMbqMBtwHsMHMbcOto+OIeEgYzl1ynCHVIy+y6rut60NlEY8jcc5whDx2n58nAE7JtMg+HDnaYhy20mNtwh8wdBwNmoMU8dFAfMLfQztN+WW0COYtHgjbRm2gALkYy/ipazMNVbI2I0kDHf8pbHnp84g0nha0DjV70MLXRHqFu/J2HOjSGzFtoMHfQGDBvQUDJsA91iNdhh8x1DJiZt7DJm173tgKoc5h59JzrGLDjDL08LWZgOJq13IlRiFWhLq9yK67DrjoAeiHUDVBnZh7AHan4m2iPnnILPW5j0/uiMypquAoH9WEq6sbf+ajrjXKuemW1dKNOkVyXGnTXU+xXN76Bg0Hjdrfb7f4e/4S38RAAnA1kPAsA/+Q9x6O43T06u+g9PwDgehdk3u0JO3q1bmOK7fWjrTb+/HD64X9gFQCWOrsAzgHAfQDew6Pdbrfb9a4yuw+jdwCAw+b19d+tDr6B/oUbiRWGvsOyJxMC150VAPjT0u2IJTmBLf/szb3+Hew/PHrwKU4DQIQi5alyX8A7D/nkWRpdGae1hcXoHFtreGvvf0xL8L/BXQFCjNJH2NiILebV/fUX8bPB3pXfbziPz7z90C8wMZ31lT4ZOtmAusSmLp7d+3/3ofFj768TAD6Oucf8wEfiPcCHIzunrhbmIq+CsVlfA642rj/yTPBhHERaT3r/n5p99RYeAxavNy46eHr27Zv4k/SmfBBNJ9UANL4P+wencbSysrKygp/ewhn8JwD0w5mW8B8+He8+hfc9lR73qjfxUdZLRJSmuwAs/QOe7U+vgv8GALhwKfj0fmBlZWVl5bev344q6TMAS2/jqDW7emwP6supLakPDgHgt7p7rAF1CfJQdw8PLrqDawDwwnXgMfwAAF4K53sSPzgE0N2rryy5+9sA8AKeSkBPuAUk0SihAOSxDlCRXswZnKoeb02LdivO9T6A/sabwU8edDb6AA6/vxHB6855VLsGvH84YxC8gBfSh+5beBXA4d+Hm616XmrY/Y9s4hUA+LfraC+i/d6z/Sc/++VeYw0rrY3mtz/30+szUl1ro/ndu995GT8B2u+d//fHPvvJXmNNWPDnqEvOYlsr5Ookfu+0+FHJ6T9/+OZgLNq98dCppX/46iNX7/74An48JaJcPf/I3zz08Y+O1iNk4ad/vv/gt35/fVBvXG/uLk5R/q09tAQ8CJ7++cUPn/zsB59oF3CN7v7X28zMPXdkRGFuA3CClhP/V9sB0OiMszvrw/HmtWcrSHYZ0Np3Lbv/3AM22QUzN4A2804dQH1nvEfv/bdTB+C0mbntmTnaAcvJiLDrI6PzhPLeA89yMv7Ot5yMbTYerd0t3ZaTzHKi1F3I/q7NqdEEPbiN0/5kPLyFFXRPLI/+Gv1Cdyq7p8p5+fp3Ti9OZY2V8o3qCVGRCQUWp4Pbo37272Clf2cFQP+O39ETywAOb51amvyH/h2PGge3Ty9O/htT03u4NE35UZbuieXgd4e3Ti3Bq3L038HtE8tXLm4+o3T8lalg07Xat7WpQe8nuROJIdSV4VzhpaPvLQFo7vWWtaJOkVxXhrObuZskd/9cGUl0z+X3v3v3Z7/cW122dChyYd1ijCnDgugKa1W68vIR4LS+s6h3/OcWdYWzklKibiI1lgV1lq0YxHJxslTE85ohCpX1PBilhbfNhTqFVmLr6CseJ0s+RCpHmgJ5bs4cRhm/OdzdzOm4nUzUMWGKuoLHlKQQ6iTbg7oYQl/zdxHXms1ms9m8hH4zsK94eG2t2bx2COBSs7/dvJRUQbc5+nHB9+tuNoOvLwiXpB8gucblsOnvx44d2C81Azu03UvN5oUugO3mdn+KBPElHV5rNi8deN9MXh9c8p/2m5fQbPbjQylroJCavYnocnr+/sHQr8yd2lHoOai7dTg9ZhedduJew7Du19Aae3AHW7A+doqflJTbLTOfO2zWg4++ZyVPXNUDfpvcAlwXno91u5Nc/KiknoOGC2wF9kGYeQejpx24jEAd6vemNPkSxx/PDJ27DKKuDt+hndlFZysJdcOGX0cbraHv7BqotYP6wHdJnpSUe8MLufJmRF0Low2r1VFHA6jbQmPIPGhgh9toDxKLH5U0dJyOf2IggLqhg9HTDlyuG0WdTrnu2pdGv97B/f6vExMXzv7AXQPwTGO/jyWcuDvo3RpeXr+473hrxcv1q4vA9/AG4Ewc7t7BC0vAWmPvMK0kmcWWJRZkViCOADj44w2vo3gLlxeBH+IN4OTEme6f8eNFYOnv8Evcg7uW4AqU9OrR1RVgee3oXdyFe0bvbx21VoDl1tG7OIWTuBcrBmVFjahbe7bxtv/zQ/yh/2sZY7P3cs87Evwo7mAZyysjivSba4cAbkyks2sPY8fzcn336K8BYKnzC+BsI1DZ70f/BUtSJo2pkf4otaZ+fb/9N6M/7gAAjoAHnPFM/VnnNAA8iE9xGvfBHb245Alsa2MJMFDSG84aAHyv8yDuQ+DQou9Z8hmWnAdwrg6TSd8K664PRxEOGk6n5a5uMTN3huF8dQx42Am8WcU689DB+LBT2x34nhFtdAbrfkm9ycnEwWSFDZSEPNIEIPQYQnKd6HnGTr0zcgnZmqywg1443xZazJ3hhAQ9OAPmNlYjSoLLW6vu+oA94kzIPlphuTfw6hDsMzPslesmrkkMoOE6aAwjsm3OyHNDBx12vZNM45I81K2i5R0NDZW0U4fb8I7PRnZOr1NTdm0i9H4Y8FxqO45bDx52nVKtOjP+Ui53AufDJiX14J933QoJ3S4arh/+JIPEa6tcN9nL68LpvL/7u9b+N2ZzbT/rtMMf/gueura3+kxESZ9iY/OD3d+19l+Z/uQ3nzgAPvhYu0mNlH4RNuoHtj8PPzz6PICbh1EWkUErLIU95+5dewr/e3G2pDvYx2D3/Y4TCpbwnx9gEfjkViEbAnq9On0+Nhj4PGwwu1Y4EbNtHXBCfMvjda5X4NBBKH9ryNxxwuEACmBxMrwO0V6eHc9wsjlS8Gf1+YiTwANn5ux02/d+HSnFU6930Bj42rB+r16jlpNw5CrfBLDluq7r+oSJAh0PEVhfg6hb9Unnl9RzXdd1e4zRSe11tgR2SEddzLv2lKd0y0eF67qu64mzjejj5+veAfaZknqjsE5+ieuu67rrIwoOImAtBJhcqCsiQuxH45OtFzYav4hy5XoF+P5XosINPTB9xOLOHgA834d3Uvtu3CzPHluyt8FvfevPF/CbxwHv0DXOAeg/ctR+LspSsoGjS1GxJ8P0velR/z3PVLKE/QJ2242gbvtH310DgEOcAIAnHpqAbjfKk6t7ufHd8xd2I97c75+OPfRMAKc7AHB6co7zZJhGVMR9i1mdOgLpD8bHgL2DsR0AOBUI/hROF452vn05MhZqY/9gCcBnOAMAaD8P4ATq+76XuyPRKostJ5hZYbc8Nh7efVjH6jBGRetN6bCTFZY9e8pOqCRfOlmd0tOQZtqIOeUTWkmyCirJMZ2QcHqnw8xDL2TVsD4tCg+cmD2ETaxO6bABCXHTs6c0pr9c96SRzYRoMYngKIFc58Ld6ayHZLgesN5ut9vt9iC8ldNmHjjTuX3U7cDZ7LRD77jnYL2zsxolo+jdjU3IlCzXpaGOt+BsdrYaIUl1FQ2PZGEziOMMmdenIdQe7+iu7uy4IXgNG1jd6axHxGMrmzaBONQN1wHA7YXIO0rT03fHm7Ih9c1HnX9eL6yCBA87CrE0YzosZMk+wsrkCOI0Kx75UYSY/abHGXciShq2AMwoWt5Tt5cRGDafTOxGHTQcyb/joAmnp4S7/h0vZ3fquX9wDuPzepgpbSWTBKVLXPN9iVOuQp9t3OSkYURHx4E5p98c3sL4WGFUSaMDiyG7X+RTpeMPxUNi/bmJcFPNgG8GdVz4RNBJ1IzjX1PXCmsTR4eiIx3tFnIhsBR0Zby9zubERIpvG6ccgLSV05nzxK8ZmOQWzN8odsflGKF5hKFCXjcKjEWpTaT0jkjG84otg4PsLrJowUsS0xrEwqNDHHpP03/EtTMPD5Z7LCDKaTWR261NSDbe7MoWp02ktCLuGG/Gxmvrsy3nYc1Luywz4SnA7tKqsXC5ZKOfaaZQzSxOzBCeYx4yE1Eq9GbueZ0PkY1smAR+Ur37P83RzS1pJHGbsGwwYs5QkQ1WEm1jkbso1ahjA9DJWy8Hp35K6FfKe481F6fr2muKtkquU6KpC37D01E72NjIsZkl0OqkH3VxNgcR0nM2hBmyOVDOmRCiDKsxNVF2KMfIvJlMTUZXWOG5rWSrgEWUgfgyeSoek2w7JeQBFnoqtnmhkZ4ccWOCBDmtW2Ep6/SzOCm23JNKqTVrpYZEwZr5EeKENacQK4CqWSUyZLFsLPiC4zupxVmBTGsktSIZBSnjDWQWXxoGR3APg3XzBCMkrZkfIQWrA0NZPBtrzRGG7R5ksv5akYRTF8+G7RrCArlu1s8lxyJf5QtWUKBI0U1EFSXxa8SS+8Equ06mKKx8LKq4xCKUHoEl1qRGUhCnUmlKGpISXlfq9UvK0CW7hcGRiEo2x9FcygMVrzPBZsgO+aFCXVnZnoay+HgTesHAxC4hyJT4J9FckzMPhWrHF3Q6TPIkXQSVlYx5WrtQ3HwI8xMVF3lJUIdJc4dZ9gsOP8l3qXIebpRecy7qLehEF0l9lBN0JKdfkvoV1TI5M8+FtJrJYUybkLR0pbnIcRShsp/mT/cfETsqmcGVjyRJkVK0yFFJojwuh6Xwr0uZPWLmsoS9AWIdM5TF2pmNX8ecZ1DjIhf/mGVL5PztKZjXmVtytK0OZGlZ5UtFoI6U5mdjQ8u2lEVlR38RqDN2to/NkZVMjrRCL2YuBHklWGG5wK/jEGPMG03MnFe2W5XndEeMdFFw1qYmP2TZTkEYNO5w+VEXM1v1RFbKMWWVmXCgJ7ISJ08o6yJAFYs6jh6hTDYHZsHHLD9lpUw4KeWoOz04O2djLC2R7Uxj+TpPjZZhhVXSIyrsY20lsiISsQIWeLzkOsoDXS4ONFw4hdSGHyNlgKyVAGRsBCpczEwxu1Jwnm6wMirV7IMZG6G/5qKKjlucpJ1JbKRqYtcLFqBO3DnCnPVAeU1ssOGUBnMq2JvZBtSJjxAbAxkXCtEcPRhr78lTt9h9YHMrrK0WpFCIkvTlhyIFnqSPScphOJvhsFCXe8tQJ+3RLWwqIlWkDhu6UoNrztgCKf7j2cesiAQ62CvPCer0CdUWxRtR5j9i1IWgyFXWtFxXVNxi67SLUZmzMdaUXSUCa9MCSpS4OBiyhuo4T03ZWTAZXy4K1CZ0rCRcMOrnIJHG3IWirghnNAsKpFLgm4ugb63YjqXfdMdFjpUF2xNkkZjGqihsfoWl6P5Em6PkL0lUtUetwZWPU3JHkoBjRVjVtyqTKE8o0cnEaBYQeyyP5ZgNTcGO8x6bZxnD4bQmKlJxFotcnCbFegZm6olyU2Ghu/+kB9Wcdynggr49NqpNoahTZpkKMhiyx8uotIdeSXPjF1D+RAzwNPAMcwKKNrJxrq8LZgeljcGugQGIie1cwChlH6eZr0kvDY/jCqv87GbUELBt40JKScQV6iTpnkcNj7BbsNohIFIRyIiicRLa6aesfU6gG6nY+FFuKSkOdVnU8PBJe/GlMyuzY+HDjzlNIyzs+5UcWYnyTEIZEw6VEnU5kDpX+58Wh/wxVlGtGj3Djebj1eOyoS7lUmcuI5ptOndGxZHIYtRxvvGijJFMjV9bac3qSsbqneNbTjQEOaQCYEglwaxtqCuIUZD6EqRCICvyXZ2jAGLjpH9HjKSMDjH7QqHHYo4dkm6yLDMMAu0U9nwR67NM35OPYVOmMlXu2S1YNoNUHstjne0UuiBduJ0cMcAxcedZeV/00NMiuW5+lH+9KnTWAGJkl7JbHK8rW5JeR6Y+yL0KaYnCzEntprQi1R/NWyiQQ1TXKKmcEJR5WRXZlFTL52s2ja/Cm+itiR1t7JKKMm0bWmWvy3a72jG/V7qMyRavTsrmBRSH1fysbmZnI/JIlo5r4ETKlL3yLldMrHnQJgSuRGM5XX4mHhspWG5SD4MlnSTL0OesppFcpiYWmqI8B6jTwj6ZiXSSSbrQtJG0SJNiMi6jGEJdViITi3w8tQ3B2eqS/yqXbM82wTBpE4R0tLBWZL8Ev2MZSYMznkwsOky//SqowhaWc4VNvDPYsvEzF/JYrTlvvnRY66ek4mPcdlz5aJdFvmDUkZWw5XJ2n8sCuuJisIf2qWXOLZKSkOxxZei/fJBkomWSoEGOEuvl5MLmVIdFmgVJzq1HSex1Male0HAo5PiU8DSWGQnGchJz92eNbMQ+XkfCGmiulYT1nx8uXgXm4sBSMl7HmkYoTT8sz4546fzUJ9yd5I+8m9YmqKRjFSdhzpkmlXXmk62oo1LjGwlyGykqsbQUkuZ2puOcGF9J7IrLnvg1G24WK6S0HOzm+DyspjHjXFEIWNetTUVzTqmO1Swd75izdXnjjmXOFbyiLv5jSi+TJUjA8l2PsQUquXOSlMGu8H3YJIuc1AnVrCsIi2UVMr1xprUri4scSVoyo10OlZ7dlHD2sWKFnXsf9NyyYI5VnciL+KKfyOLczgrUsdIR0iMy52pIbg8AzgxiApiZmQ1shwnDzj5tgnNxicLNESbQLkEiGsf6ZE4JRKGAY4vCzjLU5WNVZHj07ViUk73qglEEmHLNS5HgMlRG1HGuIZqnSLKsAqlk6bysFTVp5XV5in/EClbVmMN+SpyqxI4ganCq0jGCRAluYmwJ6ljF45hXShyhZhgly1QhMtqCcd1ZqLT4Bs0MOanxhuDZZkfrf8JB4xZ0zAbt7FPqCiTKNow6VkJinW1hFS3IrLvKBPpWZCUuQqJitU2jPDEEKHcEOD1wyGzbkGgiec7dMu0vQJsgOzHOSmsinUQgteRUQDiWuwWmZh5YBZrULI4snflKHM6l1OZvIhN4vAFSKOrk7kwthx8tKa1pfm6VJZ/XsUTkigUTbbKBLuURXdUpBXFSHIXORokYYyh9nrAwpfWhjsD5MSARkj21XEoOlJoyMsraqaQsFiwz3IBpD5tkF5npOCcJHiUTcLNgNK2aWqAF2xLtQqT88kGkOitxYs0pVYhJocLtlDPIkXQVaTqsZl7PBViJbY39Le+/q+3WETkSsdquGxB3bNiH5UJAbKeLeSHiYtC/ycTBf0Fc2xHTiZRes6EA62wDZJTBzj87yLaMoyU+J0UHj9NRsh0GEAJ77sQ2ge7Y3XLCxuDMOoYrS3/ZFK4KPTchFUI8XwxxsZpJBddLK5s5nItkEUpiFEr2HVbpVBUzaSn31KkVwk44ieCxtpHUUZQyLrCSXiW0k2XZIItRKNFcK+5UpXqAZfi1SbkuIQhmMcpumVZ1Vi2kKqYR2epzwvlPQVinnZRXalU3FiQtmapEHRkjYcG8jCwhEdswFiCJDVgNqGP13af8ZVi12vLcVeTFqpSsbsHq7lNMfFR9KwlbNqRq5SmFFVJcKOkCUaeIFhweZeI8FaVn5tKBI/2SHsVVR1wrK427mnZayBvkJAxdyQYkKUylFiJxcp4oWxXZJYZwLCexW9VUxnSyAHXpQy1i6Jr9SPnlg/G5ow8sZt0wTviYVERWymaQy1IzlQJ1JdAs1SuIMoFCuQxqkFohpDY/oOE5HKE5jbFWm6s5ZGgGmHEhYMjFWKPy4HfB8ICVFIdxspd6/ZA4Kz1Y5i1xkQepSi3XFX+8lY1VrV5qLXBSL+gfsoxzitL5TukupLGxBUWwPC1W4mnAsIJ+EUfSP71kCtoyY7bsdB0fTKs5FzoCZSa0WKDPRUyoBf0Tk9QWGAPA9A9jAkFlvCRR5rFiVyfiiI5JrQZFs+7yyXVZKWbJKcmZ1G9e8n9tN7en3mw3t4FmU54C1jt6Ldg4EBrRygawLidR3Nkb/fpo79zUm4/2zgF7BsSx5J06DYLfgsIRtVfOTSlJ1/54WbSLNO855SRayDw9mPTdEKeasGwBTIrTGFWsWWqbvZCVeCR+PSPTcfUoT702OSrd+NcDLH15TQ60lCMSlPnRqWUn5oxdTgPLkysz5qJ3mVN5afEZJJ2VOD533CfNr27jcOP8JcHyYi49iIkBpOKAooJxXlAyg7VNmTxOQHHmA7EoSHJezCxFsVDu93w19QMAuLbXugocNC5/ZzEPhTi6chUHFBWM84Ia0B2DNVRtD4NB8o+Ceuov8EMAS2f3bq2oWdXTw/GbN0bUlIBuXo4CFrOx63rXy3EbAN7vLKJ/48p7yupKt+4lJx3kWFACOktFdzttHik1vfPUAIAz1xp0zUTDWQsPyRfPRobDmVyCLlzE+maHz2ph2oruhTHO6yzidFzYxxoJcrBRf3exYNoInDszy+tKojWojdKfmEFxjJXbcBYB9PesIpHqUV8oiEWoYCzjv+KdgOTJLhapPcXjN3tI9hVn/8KT+NWGc5Rt/guzhdl9LmL5zhridTYtqjO2tZHFNM8BflZhv5c/jTlOb9c3Hn74+ktX8VsVVci0U61VT+mSSZO9V468k2E21kpGF31S09v4qr3gqYVLeIe3Tiz7Mt3tU0sA+ndOLOPw1onlg9unltDFCmxMBM4+VPKkGse5mOyvpqIuy4iQ7uVcNeqKEjRy5SUuAnXyVmKmUXDl47upr1/DUSZdy7jbGJOfFjL2mUAJviR0zAHG2s0RoxVH6cRni1GXDitWPnrEylFgTOnRQiU23UdVY5FxhQUREfOs24zO0eNc88CET1bRSr1i0JHWmmoZQO9tCc+IkEljmXdPLN0vjKOmR5wcnD+0tJKgYMWJAKn0jDJ+q+uc9I5YvAcaFzHFM+RKfkwKyrZezcp3GjN/9yRRJ1ghqUYj52uPLok6ufrtXx/gzNNLAIDu6wcnv7YG9C+eeXGc4fAf3/4Uf/bEInDpZvvWa4E3odT91U0sPekZ7q79k/+zid2pTNc+8r4/fOWmV23/4pkXm2gvq6aLApqzVELA7WryF6bcsab/9v+SrMcvSLw5GRIgWEu2NGzAcRvAFjNzC45bR2PInbE3HXPPQd2tw+kxu+i0A29CqQW4LtDySq27XqGhpvf873sOGg04PeYOXAY6eroXrF2aiJnzW4G6XN2ZRR0UYppbaDFzx3EGzG20hswttKdQV8cWM2+iweyisxWLui00hsyDBna8MnhQxyBMoJ7jf19Hh7mDuoe6+gzqUELUTZBmJeoU87o8TXC8j9exyUOnzsw8QIN7aIWZUwM9bqHXQTumpFUPOTtY5SHq3s8Ws1eonzbho27Hq2AdWzzAKrtgC3mdtA4bq41Sts9KIXVnafx+BwDw3/B7vHv01wCw1PkFljEWs5Z7bQDAo7iDZSyv4B7veb+5dgjgxjgSxc86pwHgQXyKd7EKAI/jTeBsY1LZ2rONt71f/xd/CgCP4ddYch7AubqNdJW3ErM1pyq1RlYSdFaKL3PJUyP+FffgN7jv4NWbJ7+2BsBDkAc777/rOIUn7pu8WT55vf4iDv/iqO3nW/TUiP+DJfwGfwQAcPeA9olJZZ+uj46U3cQfAsAKDoC3T+AJV0LrIiXhutVrE4ElU26FzbCUQ4s8YkybGC2jzpBX0ULdddAYRuTYnJHnhg467GIz9LSODrd9Mc1Fb/olM3vljJZUOCpF4KJX2MJWS868QVdg6j+Cq4v4FBubH+z+rrX/SoR55VmnHXq0+C946tre6jNTDw+bg1bQ5+nO9CezBR8JbzbIb+4UweuYUQCvY4t4nehHPQdbzOx6bGjoIEI/dXqz360DzjBsh2kxB3jdrEEkxOuQtzewSJsok25Auvig4GGJG48cba0BOIlzALB4Fl0A2G42m35YuivnnbcjrLjfAV6aYl/95n7r6lSW097jZrPZ7EdW3si7imgU1DP6nDDJCpmmQuzMhPJkYzXNLJ7nnZ3HAeCB61PPPxofxbmw0fhF1NbBK8D3v7IUXKiP2s8BwF14ZwUA3vPWVC/23fPBT0+iuwKgj0WL2UHWSGJMTFZuN9oTIXt7zMfux4eebOZxqCcemoBuNwoc3cuN756/sBsE3ZYX4+lPvJIOjjzV9HRnzPZG6ZHrHwPALZzLoIMaG9HsUlF0IXFynfwuSNamIY9cp0aYBDPvoD6YWIx7zLwT0lbXsTqM3EuroxfUYQfORIqro+fbgGPkugHqQ2ZuYKBpI1GFXEdqwvxO+9BHHiDMdC5IzoJELF9BOAI7MoRkpygyfv5o9QEAwEMruPFV56X73nkZUzJc/0tYvwsA8MTS1JcXNtrP4aAxzr12vfF1AMA9a7jxVefq3a9vNN6PaIW7CwCXLjf+Dj/ZW38xlkKzd3lCwsA5PjeT49wEVGIdVvA6GYtjei1ZW9EZU7jNzDt1APVpbXViMJnWR3c8brWJRnhZcZl5ywHgRvHIESddB4B1zQaAwngdx/6OPiwtWZXJM2Ia5JnDW6Nfp5YA/7zhVDq4PdZHp/XVO94X3dHz7uiNV0LXL3FGGhxVcHgrVKI26mUdqgp1x/KgG3GhqKuhSscwscwWj3qLpzLUGbMbW2KgpuOARdJkjKrpnT06SENWYIOPIQzJOtRpozuF/xC3ecao/nEHpChD5yhyhKRDx1P6M7Ey487FxUeUF28qKdsI1aNNRM+YDOY0nTKxjDZBpg9/KaqJNF7bnUOb0HJnorF9FdNDXroLaS1V0Bd0zIKyS+BMxs76FrSXXXAEjzmxnKi/n1xV4WQlM+ICv9bA61QEKrJtJSkoDA6xPbxRcaoZGqFsF/PZepOwEQqxDIkMmJPIXtRZvRAohiEpHSHO1Uk2VlM5UEdpCKDswyVmnCKh1YlUPI4RDIXuXyQxNUzOICdpOCSRdhYoh2W211gTAPE47/4LUzMhHGupdv8LVp9KroaT4bHQQ+9aCSmvgPYWKhpqpVCCzSSq2U15RSM0qx9Snq8LJAYbwzAfG9TpgisnmyVShoj1sQiybkIbSbaijtSOEMsNPJuqaR4vAywx6szdt83mx6psrnhcItQZtCBpcj3LjTBKWeezlBVhPSO17dQ/K4q5R8rY0sBpPZhqejk3OYsxgFpnr7NnAWG5trG9HaOMrSZpEpnoZE3XWOswvZEOHOb52DoBjXL1l0wpOAu6Chb18NGwbW1uoVRQESm9dMzkxk+OKVczNvfY2CQvlXTGmgbWas15wXpmIFqRBIcrjdagVE9ge0CqgdcVt4Ek6pXEGdos51Slwn6RiZ4Uc1RyqiBScmlkXFg5ndPeXsuJaJcSPZ2ECiFz15sVwMfTSgq8JxtOJkan7dcAACcfeWIx5v1Ta9as6vnOLESoUqaAWIrDkwZRNwrHe/37by9Hvz+HciWWyKnwLsbyJ6P7sG1m5kHr6M/LSStJFwKDNZXtVJNy1KV2YelqfXBQqNyn4WMutrGc52OKC+WkD40LBhnCKDm4CwC2//nTkYzXff3g5F8GJbz23ltLzyzj4NWbOPOYd6XMOPv2a7vb//zp0jPLB6/eRAZRUC1CTC+G6q3qM0EtDXTJXFzatn8VpXcR6rAxuqiXeR1w62iMr6psowHX6fEW0HC9GLt+9nqPuY0W3AacHafu5gnAq+YeMSi+n8vQx6z0zmeYanoW1NVd13XrXiznVbRGCOygMWTeQgB16PGQO6j3mAcNbDG7WGfmTdSZ23B6zG2gzdxzkPVKojDqkgqBJL2Q9TGk6J77rr/kBiEieritqEM86vxU32EeeNfrcgu90a27rQDqVgO38Q5QH9/g28IWt7HO/m3PzC4GWfmLkTsTS5mgm9fVTAoebWbm4dYnX+3iPTza7Xa7XWAPb2IFAL4cyPkAAFz3ni/VB9jzr4r5Mj4C8BgA4F4v620YOfludSK1GUfxBGjma0UKxoJxCi2ufXTxpysfYWNj9OTIu2jt7pms3rVFuHfQBR7y87z1nCnDfopQne91QSpGXp8Ujg6vXxDqpKp/CG8CaD3p/XUKGMRk/GD04xTw8cjwYmz0VAdZKSbaVa4+zFbLSkBcMzzZfMkO9wMrKysrK799/TYaR4cA8NuZXINDAMAelu7BvwMA3sEXbFmzWC+JrF+98yy2RZwRewGP4kFnow/g8Psbp/B1vALg8O/D+b6FvwWAK2jhK372l/GEhab2XFUXEWNNnNnFz5Y8s8ioXPcWAPz++sD5Dhavnn/kbx76+EdH60t4+o3LR09+9oOZdfbpNzY++e+fe33D+R4Wr55/5KX7Pn7+aH0pwwhlIFA2mgrddJejpsnHpnwJNC3tai0nSLTX+Wm1x6ML3RxPrV0FUN8MWE68X8MWAKwOxtnrm+NbyDujC8c7WfV733Kiw9KlxSIne7kf4qtLN/ohvbnIbjkx6F83uq1tZfSgf2f8++D2ieXDW6Nb2Q5uj34FL2Ib3f92cPv0InB468QygP6dzBe1KYskpkpPsPJegXyOhqopVorzsGZQVxgiRL/ONy0EKETV7XUlTxqi4loXMrBCXSHaLxlrCeetSIfDU4W6QiwunPO9Sc7KVKHOjsWNjhVZSHV4KoWoI1uHIhT2KBD9neIPbycfE+QsxCexssX+VPo4+t2YOjzF7kJEyzLsc6vDitJCfcvJUEB6oxu7yUNs2cnEax+9CABY+xQAcObF/sUzL47fHv7j25/iz55YBC7dbN96LfBmNnVf2PV/vH5w8mtrAJrYDbx+/WCqJKX6PklRvBQ3RrIkNVitNVG1V+dUgSNnzKFfmTvaUvDeOqi7dTg9ZhedduDNbBrW/YJbY8f3YK3rgNuYKklj14Vt8VDlX2mHryfs9eoMDnf/Ef/HLX+La3cq658fbX2w+8Hm0TcBAPcklXrY9Hdpr2y0frf7QWv/1WlGeLk+2H1/6+hioCQRMlpkwspXkQmRmtnKG9hnltcvjX69g/v9XycmDnL9gbsG4JnGfh9LOHE34g9hd7+473joe7l+dRH4Ht4AnDom5b+wBKw19g7TSrJUJ5bEUK4wddkjBjKRmhApGlG39mzjbf/nh/hD/9cyxuf+l3ueP8CjuINlLK+MuF2/uXYI4Ebz0hi+D2PnLADg3aO/BoClzi+As41AZb8f/Rcs6ViaeEjlXAixN2/rXgH09J0Rc9eH7MtqDafTcle3mJk7w3C+OgY87ATerGKdeeigN/ZWcQfswvNG6QzW/ZJ6g3ERA9QH/oGzUUkondyk9KSN5hOMAPL4nGhA3eiPIfMIdQAaruMdfg2nzRktYuigwy42Jw+YfdStooV6REk7dbgN78ijsCsQ4sgpKUpHHT8Tc7XKI8RDxXjKtBNBadju87AeojpwOszDVpSWugWnF37WQX3TO5wY4Jzw/sUm87AVPnzddhy3gXpPNf1Lo4KaqSlucSwadYhCHQ8GPg8biICOeR1whtGoc/2SQvlbQ+aO4wxEenZcjsBCOeZstZxEi6pLSwCweBa3AWC72Ww2m54h5LwTFVbsO8BLkc6aJz31dPEsup7i0Ww2m31cdn64CKxcPXq1aLuH2V1BMtlPYmUFLhSggY0C2QEXNhq/iIpl9wrw/a9EnZB44PrUn3f2AOD5Ps4uAsDduKlpA0kPZljPHNdSvdJdTyOo2/7Rd9cA4BAnAOCJhyag241iad3Lje+ev7Ab8eZ+fOjZ7XAaAE53AOD05OTsyaDSz+qG2P86vZASRSGQOtWkeM6a0Ca20OBRKJ0paWx1GLP71ZvSYSdyHXv2lJ1QSQ3seBrull7xDYoKh3GZLF/BaTAp8rRORFnk7gJAc8/99ud+dXlahut/Cet3AQCemF5ML2y0n8NBA1O5m3sMADe+6rx03zsvT79D/5Gj9cc+++X1xvvTQg9LrBUktSFOQkG0xahL0VvrJBqnW4ZHRTNtsegZ8Q2SRpEqXocEXsfDdQBwe9EnFUOHC3dQHzLzpscgQ7zOP6EY1nt7LgC0hmr5BQrgRaXUhQvjddEFdU+MeFIXp0LqweikIjB9uLB/x8vZnXrev7My/nUiQgM5uD058mivAlGIziHBczPqEdXJxEC/snWuhGFwdDaVotUOmfBXJnf/i1XQCFnPmSiOW1xKF4L0fLmoNLendRixsCMLhtJyyFIiG8vdyWNwRkzBnak5MpXzQlrN8dhrxYNAZ0VJobAUMi821bU5CW9bswR0NP0H5bl80P84vMZGlUm52jnjaxtXFuWoQgE9xe9ynIlEzKSoncdChzWgVJK2XVBrFGHSdPu4IV5X3EVX+u4l0hAGJ0PJpYxCYAh1+kZIFewKj6zDeWijp/VisetsQB2ZmKdSI8RCMg4XCDgNs5qMzSS2AXXKXH1I2YCFosMUZo4YKTgmMK2ipnhWl5diNWsnNqvjRSnnhwuT3am4CZ+3JrIVdTaNHpON9wGweWTagfCaPiJzlhVTJNeMWYnTRyiC3Qm0gMQtXQmPcypD0SShbBY51ZbDbJPCiL2uMPvTtGMEpP1xaN6uupvtkrznqoIBVsXr7BScWEK6E2g4GVv5SBtBdIDOHrnOnsjSU6uVTIgOTqqEtRLDuqBRatNCqVufUHXkTOUxBDLdPccmqEPzeIGtJtTZBEOfryVeu0YK26kKJ5QL2mVCq1ptwso7ieK+Jjumhz7Bg3N+L85XCtz9p1A/SahXGWOIs1iDYsrgcC7KOAgUvfMkZx1U6qw0oRBLVJHpitFJstJyYudCoOEeMTLG84WDEehaVcQ8C03rsMLyHuXU+Uh5xvydY1M1sfqpWGptQoZ+uYLns0zG46AgKlbCOJ3w0lC1Yh+Wjc29+QAd5aEQWUAh23f/WekISWck+4nCeSlaQB9rmmag9bAV22xgOc07pSaaz4ldKOrUTiLSDOpcDuMZvy6QzZBVxdW0T6ICDHIZj+VFfk8yNceQQdAgJ3bgW6pBclsw4oZDbV7KqS0M2+vKph9qsNfpInbWrzUOSa6TqQuq2gAdnhVkBHwFKZ+y1MmyPlvqiVyove5Y3ShdUUcx6jgjVZVH4yuFAqdsdSyvyfsYxHSqUoW6KlWpQl2VKtRVqUJdlapUoa5Kc5Jsstdxyt/HLKVRgyvUZUvhe4XCF84db9glU6fMVuSFgqfzlEMqTRk+6bjvXcxSJ4//rlU9y777X6UqZVztrVphU8JAVSusrdSRZV0LpioS4bRKLxKegxWWtaxSFqRiLSeJ6sKxP881v9SpWUvY6hDh/FKnZg9hq+VVHHYlp07NUsJWoAtRh3j6jwp1ymA3/l2BLmlSlp46NWsISzxHZNVDnQhKVajLRVgKXHFYgS6J280BdWqWEZapAl0EdXySzAt1LOnDZFtiDsPtK6SO1Zeilg51VTpWqfLqrFKFuipVqKtSlSrUValCXZWqVKGuShXqqlSlCnVVqlBXpQp1VapShboqVairUpUq1FWpQl2VqlShrkoV6qpUpQp1VbIh/X+/f4u100Y2IAAAAABJRU5ErkJggg==	1	2026-03-25 23:56:05.322+00	2026-03-25 23:56:05.322+00
\.


--
-- Data for Name: site_snag_highlights; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.site_snag_highlights (id, drawing_id, payload, sort_order) FROM stdin;
c4bfb229-3c9f-44a8-a6b2-6223dcde7862	6516bf23-37f9-45ae-885e-6ded913074d6	{"cx": 0.5664974720775564, "cy": 0.43019137112417255, "id": "c4bfb229-3c9f-44a8-a6b2-6223dcde7862", "type": "circle", "radiusPx": 32, "strokeColor": "#2dd4bf"}	0
\.


--
-- Data for Name: site_snag_measurements; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.site_snag_measurements (id, drawing_id, payload, sort_order) FROM stdin;
\.


--
-- Data for Name: site_snag_prefs; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.site_snag_prefs (company_id, show_archived) FROM stdin;
12	f
\.


--
-- Data for Name: site_snag_removed_preset; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.site_snag_removed_preset (company_id, preset_name) FROM stdin;
\.


--
-- Data for Name: site_snags; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.site_snags (id, drawing_id, nx, ny, title, description, status, category, assignee_user_id, assignee_manager_id, assignee_display, target_date, mock_planning_task_id, archived, photos_before, photos_after, created_at, updated_at) FROM stdin;
4c429ea4-457e-4b1d-82cb-284344a8d6a6	6516bf23-37f9-45ae-885e-6ded913074d6	0.4102606205743763	0.46055459414277544	Crack apear	vjvjhvvhvhv	open	Crack	17	\N	John Mc'Onik	2026-03-29	PLAN-SNAG-0001	f	["data:image/jpeg;base64,/9j/4AAQSkZJRgABAQAAAQABAAD/4gHYSUNDX1BST0ZJTEUAAQEAAAHIAAAAAAQwAABtbnRyUkdCIFhZWiAH4AABAAEAAAAAAABhY3NwAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAQAA9tYAAQAAAADTLQAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAlkZXNjAAAA8AAAACRyWFlaAAABFAAAABRnWFlaAAABKAAAABRiWFlaAAABPAAAABR3dHB0AAABUAAAABRyVFJDAAABZAAAAChnVFJDAAABZAAAAChiVFJDAAABZAAAAChjcHJ0AAABjAAAADxtbHVjAAAAAAAAAAEAAAAMZW5VUwAAAAgAAAAcAHMAUgBHAEJYWVogAAAAAAAAb6IAADj1AAADkFhZWiAAAAAAAABimQAAt4UAABjaWFlaIAAAAAAAACSgAAAPhAAAts9YWVogAAAAAAAA9tYAAQAAAADTLXBhcmEAAAAAAAQAAAACZmYAAPKnAAANWQAAE9AAAApbAAAAAAAAAABtbHVjAAAAAAAAAAEAAAAMZW5VUwAAACAAAAAcAEcAbwBvAGcAbABlACAASQBuAGMALgAgADIAMAAxADb/2wBDAAYEBAUEBAYFBQUGBgYHCQ4JCQgICRINDQoOFRIWFhUSFBQXGiEcFxgfGRQUHScdHyIjJSUlFhwpLCgkKyEkJST/2wBDAQYGBgkICREJCREkGBQYJCQkJCQkJCQkJCQkJCQkJCQkJCQkJCQkJCQkJCQkJCQkJCQkJCQkJCQkJCQkJCQkJCT/wAARCAJSA4QDASIAAhEBAxEB/8QAHAABAAEFAQEAAAAAAAAAAAAAAAMBAgQFBgcI/8QAUxAAAQMCAgUHBggKCAYCAwEAAQACAwQRBRIGEyExURQiMkFhcZEHUlOBkrIVM1Ryk6Gx0RYjQmJjc3TB0uEXJCY0NlWUsyU1Q4LC8ESDRaLi8f/EABsBAQACAwEBAAAAAAAAAAAAAAABAgMEBQYH/8QAQhEBAAEDAQQFCQYEBAYDAAAAAAECAxEEBRIhMRNBUWFxBhQiMoGRobHBFTNS0eHwIyRCYiU0NXIHFkNjgvFTkqL/2gAMAwEAAhEDEQA/APNwFW21URdtkwrballRCQBcmwRGFSigfVxt3XcexQOrJHbrNVZqiEZhndSoXNbvcB3la50r39J5PrVl1XfRvNlrox+W3xVvKIvPC16JvyjebETRk9NvirwQdxBWrS5Cb6d5td6Fa1s8jNzypmVrh0mgjsUxXBvQzE6lCyqjfsvlPapVaJysqgVEUmFQEttVEQwrballREMKlFREMK9SKiIYVCAKiIYVttS21URDCtkKoiGFU6lREMMavptfCSOk3aO1addCtPiFPqJsw6L9o7CsF2nrY66etjIiLAxiIiAiIgIiICIiAiIgIiICIiAiIgIiICIiAiIgIiICIiAiIgIiICIiAiIgIiICIiAiIgIiICIiAiIgIiICIiAiIgIiICIiAiIgIiICIiAiIgIiICIiAiIgIiICIiAiIg6FCQ0XJsFZLM2IbdpO4LClmfKedu4Bbk1RDYmcMiWrA2R7TxKxnyOebuJKssllimrLHMzIiWSyZBEslkyCJZLJkESyWTIIlksmQUkc74+idnAqOyWTIzoqpj9h5pUy1iliqHR7DtbwVor7Voq7WcitY8PbmadiuWRcREUgiIgIiICIigERFIIiICIiAoayDlEDm25w2t71MiiYyiYy55Fk4hBqagkdF/OCxlpzGJw15jHAREUAiIgIiICIiAiIgIiICIiAiIgIiICIiAiIgIiICIiAiIgIiICIiAiIgIiICIiAiIgIiICIiAiIgIiICIiAiIgIiICIiAiIgIiICIiAiIgIiICIiAiIgIiICIiAiIg2BJc4km5REWZkEREBERAREQEREBERAREQEREBERBcyR0brtPq4rOhmbK242HrC16qxxY7M02KmKsJicNmiiilErbjf1hXrJlkXIrUQXIrUQXIrUQXIrUQXIrUQXIrUQXIrUQY2JQ6ynLgLlm31da0y6IgEEEXB2FaCaMxSuYfyTZYbkdbFcjrWIiLExiIiAiIgIiICIiAiIgIiICIiAiIgIiICIiAiIgIiICIiAiIgIiICIiAiIgIiICIiAiIgIiICIiAiIgIiICIiAiIgIiICIiAiIgIiICIiAiIgIiICIiAiIgIiICIiDYIiLMyYEREMCpuQq0u4oLrhULlG54CjMwHWoyMjMmZYpqG8QnKBxCjIysyZli8oHEJygcQmRlZkzLF5QOITlA4hMwMrMmZYvKBxCcoHEJvQMrMmZYvKBxCcoHEJvQMrMmZYvKB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1I4JqQmJGr5KU5KVtNSOCakcExI1fJSnJStpqRwTUjgmJGr5KU5KVtNUOCakcExI1fJSnJStpqhwTUjgmJGr5KU5KVtNSE1I4JiRq+SlOSlbTUjgmpHBMSNXyUpyUraakcE1Q4JiRq+SlOSlbTUjgmqHBMSNXyUpyUraakcE1ITEjWspMzgCpvg9vA+KzWRAPB7VmagcFemnLHXVhpvg9vA+KfB7eB8VudQOCagcFbcU35ab4PbwPinwe3gfFbrUDgqagcE3Dflpvg9vA+KfB7eB8VudQOCagcE3E78tN8HN4HxV7KBjfybrbCnB6lcIAOpNxG9LBipbdSzI4bWUojA6lfYBWilWZUa2ykCoBZVV1VUVEQVRURBr0RFrtoREQFSwVUQUyhULVcilC3KmUq5EyYW5UylXImTC3KmUq5EyYW5UylXImRblKZSrkTJhblKZVciZMLcpTKrkTJhblKZVciZMLcpTKVciZFuUplKuRMmFuVMpVyJkwtyplKuRMmFuVMpVyJkW5SmUq5EyYW5SmVXImTC3KUyq5EyYW5SmVXImTC3KUylXImRblKZSrkTJhblTKVciZMLcqZSrkTJhblTKVciZFuUplKuRMmFuUplVyJkwtylMquRMmFuUplVyJkwtylMpVyJkW5SmUq5EyYW5UylXImTC3KmUq5EyYW5UylXImRblKZSrkTJhblKZVciZMLcpTKrkTJhblKZVciZMLcpTKVciZFuUplKuRMmFuVMpVyJkwtyplKuRMmFuVMpVyJkW5SmUq5EyYW5SmVXImTC3KUyq5EyYW5SmVXImTC0AgrPbzgCsJZkJvEPBXoUrhdZLIiyMZZLIiBZLIiBZEREFlXYqIhhW6XVEQwrdLqiIYVuioiGGCiItdsiIiAiIgIiICIiAiIgIiICIiAiIgIiICIiAiIgIiICIiAiIgIiICIiAiIgIiICIiAiIgIiICIiAiIgIiICIiAiIgIiICIiAiIgIiICIiAiIgIiICIiAiIgIiICIiAiIgIiICIiAiIgIiICIiAiIgIiICIiAiIgLIpTzXDgsdS07srx27FamcSrVHBkoiLMwiIiAiIgIiICIiAiIgIiICIiDBREWu2BERAREQEREBERAREQEREBERAREQEREBERAREQEREBERAREQEREBERAREQEREBERAREQEREBERAREQEREBERAREQEREBERAREQEREBERAREQEREBERAREQEREBERAREQEREBERAREQEREBERAREQEREBERAREQEBsQeCIiGc05gCOtFFA+7LX3KS62InMMMxhdZUVLlLojC6yoqXKXQwusqKlyl0MLkVtylyhhVVsrbpcoYVVbK26XKGFUVLohhhIiLXbAiIgIiICIiAiIgIiICIiAiIgIiICIiAiIgIiICIiAiIgIiICIiAiIgIiICIiAiIgIiICIiAiIgIiICIiAiIgIiICIiAiIgIiICIiAiIgIiICIiAiIgIiICIiAiIgIiICIiAiIgIiICIiAiIgIiICIiAiIgIiICIiCWm6R7lkIizUcmKrmIiKyoiIgIiICIiAiIgIiICIiD/9k="]	[]	2026-03-25 23:24:59.863+00	2026-03-25 23:56:04.112+00
a2b92c64-7735-49e8-900a-fa9ad1dbc5ce	6516bf23-37f9-45ae-885e-6ded913074d6	0.6083662744548038	0.46500363424530317	Door way 60cm		open	Other	\N	\N		2026-03-24	PLAN-SNAG-0002	f	[]	[]	2026-03-25 23:25:17.43+00	2026-03-25 23:55:21.433+00
\.


--
-- Data for Name: tasks; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.tasks (id, user_id, project_id, name, deadline, status, created_at) FROM stdin;
\.


--
-- Data for Name: users; Type: TABLE DATA; Schema: public; Owner: pg_database_owner
--

COPY public.users (id, company_id, project_id, role, name, email, password, active, created_at, active_status, deactivation_date, deactivated_by_manager_id, onboarding, onboarded) FROM stdin;
19	13	\N	Dryliner	George Dume 	gerghe@gmail.com	$2b$10$LvaqgvtxPQavhiuguSGDBuNPFA3tR.0l8PfHyeM5eoWAShxj1E7j2	t	2026-03-22 20:08:00.231703	t	\N	\N	no	t
18	13	\N	Plaster	Roman Demian	rdemian732@gmail.com	$2b$10$SHmM7Mq6zGuaZ1TN0Bk8yuktYTgwVQKMpCs7bOlQ6tHI71xFz0Po2	t	2026-03-22 20:06:26.73141	t	\N	\N	no	f
17	12	8	Dryliner	John Mc'Onik	john@akmer.com	$2b$10$s3UddYUvi.HEYghk6CcjCu.27kzgyGjutUa6i0uOkqPqBAQ7Wc8vu	t	2026-03-22 14:22:01.642749	t	\N	\N	yes	t
\.


--
-- Data for Name: work_hours; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.work_hours (id, user_id, project_id, clock_in, clock_out, clock_in_latitude, clock_in_longitude, clock_out_latitude, clock_out_longitude) FROM stdin;
73	17	8	2026-03-22 21:35:50.351126	2026-03-22 21:37:01.800085	53.535815	-2.424949	53.536121	-2.425173
74	17	8	2026-03-22 21:37:05.049989	2026-03-22 21:37:06.449758	53.536045	-2.425110	53.536045	-2.425110
\.


--
-- Data for Name: work_logs; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.work_logs (id, company_id, submitted_by_user_id, project_id, job_display_id, worker_name, project, block, floor, apartment, zone, work_type, quantity, unit_price, total, status, description, submitted_at, work_was_edited, edit_history, photo_urls, invoice_file_path, archived, created_at, updated_at, timesheet_jobs, operative_archived, operative_archived_at) FROM stdin;
23	12	17	8	WL-002	John Mc'Onik	Victoria Riverside	\N	\N	\N	\N	Drylining	\N	\N	\N	pending	vdv	2026-03-26 22:32:14.409128+00	f	[]	["/uploads/worklogs/1774564333182-ergtfwve.jpeg"]	/uploads/worklogs/1774564333432-qplk5yac.pdf	f	2026-03-26 22:32:14.409128+00	2026-03-26 22:32:14.409128+00	[{"stage": "complete", "photos": ["/uploads/worklogs/1774564333182-ergtfwve.jpeg"], "duration": null, "location": "xs", "description": "xs", "progress_pct": 0, "duration_unit": "hours"}]	f	\N
24	12	17	8	WL-003	John Mc'Onik	Victoria Riverside	\N	\N	\N	\N	Plastering	\N	\N	0.03	pending	d	2026-03-26 22:42:36.448033+00	f	[]	["/uploads/worklogs/1774564955188-fcz2umz0.jpeg"]	/uploads/worklogs/timesheets/timesheet_report_2026-03-26.pdf	f	2026-03-26 22:42:36.448033+00	2026-03-26 22:42:36.448033+00	[{"stage": "complete", "photos": ["/uploads/worklogs/1774564955188-fcz2umz0.jpeg"], "duration": 0.75, "location": "ds", "description": "ds", "progress_pct": 0, "duration_unit": "hours"}]	f	\N
22	12	17	8	WL-001	John Mc'Onik	Victoria Riverside	\N	\N	\N	\N	Plastering	\N	\N	1000.00	waiting_worker	xsx	2026-03-26 22:21:36.550153+00	t	[{"at": "2026-03-26T22:49:34.489Z", "field": "total", "editor": "Roman Demian", "newVal": 1000, "oldVal": "2000.00"}]	["/uploads/worklogs/1774563691747-rj67gdta.jpeg"]	/uploads/worklogs/1774563692042-7kcgovus.pdf	f	2026-03-26 22:21:36.550153+00	2026-03-26 22:49:34.489667+00	[{"stage": "complete", "photos": ["/uploads/worklogs/1774563691747-rj67gdta.jpeg"], "duration": 3, "location": "plot 1", "description": "cdsc", "progress_pct": 0, "duration_unit": "days"}]	f	\N
\.


--
-- Name: companies_id_seq; Type: SEQUENCE SET; Schema: public; Owner: pg_database_owner
--

SELECT pg_catalog.setval('public.companies_id_seq', 13, true);


--
-- Name: manager_id_seq; Type: SEQUENCE SET; Schema: public; Owner: pg_database_owner
--

SELECT pg_catalog.setval('public.manager_id_seq', 14, true);


--
-- Name: material_categories_id_seq; Type: SEQUENCE SET; Schema: public; Owner: postgres
--

SELECT pg_catalog.setval('public.material_categories_id_seq', 11, true);


--
-- Name: material_consumption_id_seq; Type: SEQUENCE SET; Schema: public; Owner: postgres
--

SELECT pg_catalog.setval('public.material_consumption_id_seq', 23, true);


--
-- Name: material_suppliers_id_seq; Type: SEQUENCE SET; Schema: public; Owner: postgres
--

SELECT pg_catalog.setval('public.material_suppliers_id_seq', 7, true);


--
-- Name: materials_id_seq; Type: SEQUENCE SET; Schema: public; Owner: postgres
--

SELECT pg_catalog.setval('public.materials_id_seq', 14, true);


--
-- Name: operative_task_photos_id_seq; Type: SEQUENCE SET; Schema: public; Owner: postgres
--

SELECT pg_catalog.setval('public.operative_task_photos_id_seq', 5, true);


--
-- Name: planning_plan_tasks_id_seq; Type: SEQUENCE SET; Schema: public; Owner: postgres
--

SELECT pg_catalog.setval('public.planning_plan_tasks_id_seq', 30, true);


--
-- Name: planning_plans_id_seq; Type: SEQUENCE SET; Schema: public; Owner: postgres
--

SELECT pg_catalog.setval('public.planning_plans_id_seq', 7, true);


--
-- Name: proconix_admin_id_seq; Type: SEQUENCE SET; Schema: public; Owner: postgres
--

SELECT pg_catalog.setval('public.proconix_admin_id_seq', 1, true);


--
-- Name: project_assignments_id_seq; Type: SEQUENCE SET; Schema: public; Owner: postgres
--

SELECT pg_catalog.setval('public.project_assignments_id_seq', 20, true);


--
-- Name: projects_id_seq; Type: SEQUENCE SET; Schema: public; Owner: postgres
--

SELECT pg_catalog.setval('public.projects_id_seq', 9, true);


--
-- Name: qa_cost_types_id_seq; Type: SEQUENCE SET; Schema: public; Owner: postgres
--

SELECT pg_catalog.setval('public.qa_cost_types_id_seq', 3, true);


--
-- Name: qa_floors_id_seq; Type: SEQUENCE SET; Schema: public; Owner: postgres
--

SELECT pg_catalog.setval('public.qa_floors_id_seq', 4, true);


--
-- Name: qa_job_statuses_id_seq; Type: SEQUENCE SET; Schema: public; Owner: postgres
--

SELECT pg_catalog.setval('public.qa_job_statuses_id_seq', 3, true);


--
-- Name: qa_job_templates_id_seq; Type: SEQUENCE SET; Schema: public; Owner: postgres
--

SELECT pg_catalog.setval('public.qa_job_templates_id_seq', 9, true);


--
-- Name: qa_job_workers_id_seq; Type: SEQUENCE SET; Schema: public; Owner: postgres
--

SELECT pg_catalog.setval('public.qa_job_workers_id_seq', 1, false);


--
-- Name: qa_jobs_id_seq; Type: SEQUENCE SET; Schema: public; Owner: postgres
--

SELECT pg_catalog.setval('public.qa_jobs_id_seq', 18, true);


--
-- Name: qa_supervisors_id_seq; Type: SEQUENCE SET; Schema: public; Owner: postgres
--

SELECT pg_catalog.setval('public.qa_supervisors_id_seq', 1, false);


--
-- Name: qa_template_steps_id_seq; Type: SEQUENCE SET; Schema: public; Owner: postgres
--

SELECT pg_catalog.setval('public.qa_template_steps_id_seq', 17, true);


--
-- Name: qa_templates_id_seq; Type: SEQUENCE SET; Schema: public; Owner: postgres
--

SELECT pg_catalog.setval('public.qa_templates_id_seq', 11, true);


--
-- Name: qa_worker_categories_id_seq; Type: SEQUENCE SET; Schema: public; Owner: postgres
--

SELECT pg_catalog.setval('public.qa_worker_categories_id_seq', 4, true);


--
-- Name: qa_workers_id_seq; Type: SEQUENCE SET; Schema: public; Owner: postgres
--

SELECT pg_catalog.setval('public.qa_workers_id_seq', 1, false);


--
-- Name: tasks_id_seq; Type: SEQUENCE SET; Schema: public; Owner: postgres
--

SELECT pg_catalog.setval('public.tasks_id_seq', 1, false);


--
-- Name: users_id_seq; Type: SEQUENCE SET; Schema: public; Owner: pg_database_owner
--

SELECT pg_catalog.setval('public.users_id_seq', 19, true);


--
-- Name: work_hours_id_seq; Type: SEQUENCE SET; Schema: public; Owner: postgres
--

SELECT pg_catalog.setval('public.work_hours_id_seq', 74, true);


--
-- Name: work_logs_id_seq; Type: SEQUENCE SET; Schema: public; Owner: postgres
--

SELECT pg_catalog.setval('public.work_logs_id_seq', 25, true);


--
-- Name: companies companies_pkey; Type: CONSTRAINT; Schema: public; Owner: pg_database_owner
--

ALTER TABLE ONLY public.companies
    ADD CONSTRAINT companies_pkey PRIMARY KEY (id);


--
-- Name: manager manager_email_key; Type: CONSTRAINT; Schema: public; Owner: pg_database_owner
--

ALTER TABLE ONLY public.manager
    ADD CONSTRAINT manager_email_key UNIQUE (email);


--
-- Name: manager manager_pkey; Type: CONSTRAINT; Schema: public; Owner: pg_database_owner
--

ALTER TABLE ONLY public.manager
    ADD CONSTRAINT manager_pkey PRIMARY KEY (id);


--
-- Name: material_categories material_categories_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.material_categories
    ADD CONSTRAINT material_categories_pkey PRIMARY KEY (id);


--
-- Name: material_consumption material_consumption_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.material_consumption
    ADD CONSTRAINT material_consumption_pkey PRIMARY KEY (id);


--
-- Name: material_suppliers material_suppliers_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.material_suppliers
    ADD CONSTRAINT material_suppliers_pkey PRIMARY KEY (id);


--
-- Name: materials materials_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.materials
    ADD CONSTRAINT materials_pkey PRIMARY KEY (id);


--
-- Name: operative_task_photos operative_task_photos_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.operative_task_photos
    ADD CONSTRAINT operative_task_photos_pkey PRIMARY KEY (id);


--
-- Name: planning_plan_tasks planning_plan_tasks_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.planning_plan_tasks
    ADD CONSTRAINT planning_plan_tasks_pkey PRIMARY KEY (id);


--
-- Name: planning_plan_tasks planning_plan_tasks_qa_job_id_key; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.planning_plan_tasks
    ADD CONSTRAINT planning_plan_tasks_qa_job_id_key UNIQUE (qa_job_id);


--
-- Name: planning_plans planning_plans_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.planning_plans
    ADD CONSTRAINT planning_plans_pkey PRIMARY KEY (id);


--
-- Name: proconix_admin proconix_admin_email_key; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.proconix_admin
    ADD CONSTRAINT proconix_admin_email_key UNIQUE (email);


--
-- Name: proconix_admin proconix_admin_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.proconix_admin
    ADD CONSTRAINT proconix_admin_pkey PRIMARY KEY (id);


--
-- Name: project_assignments project_assignments_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.project_assignments
    ADD CONSTRAINT project_assignments_pkey PRIMARY KEY (id);


--
-- Name: projects projects_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.projects
    ADD CONSTRAINT projects_pkey PRIMARY KEY (id);


--
-- Name: qa_cost_types qa_cost_types_code_key; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.qa_cost_types
    ADD CONSTRAINT qa_cost_types_code_key UNIQUE (code);


--
-- Name: qa_cost_types qa_cost_types_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.qa_cost_types
    ADD CONSTRAINT qa_cost_types_pkey PRIMARY KEY (id);


--
-- Name: qa_floors qa_floors_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.qa_floors
    ADD CONSTRAINT qa_floors_pkey PRIMARY KEY (id);


--
-- Name: qa_job_statuses qa_job_statuses_code_key; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.qa_job_statuses
    ADD CONSTRAINT qa_job_statuses_code_key UNIQUE (code);


--
-- Name: qa_job_statuses qa_job_statuses_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.qa_job_statuses
    ADD CONSTRAINT qa_job_statuses_pkey PRIMARY KEY (id);


--
-- Name: qa_job_templates qa_job_templates_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.qa_job_templates
    ADD CONSTRAINT qa_job_templates_pkey PRIMARY KEY (id);


--
-- Name: qa_job_workers qa_job_workers_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.qa_job_workers
    ADD CONSTRAINT qa_job_workers_pkey PRIMARY KEY (id);


--
-- Name: qa_jobs qa_jobs_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.qa_jobs
    ADD CONSTRAINT qa_jobs_pkey PRIMARY KEY (id);


--
-- Name: qa_supervisors qa_supervisors_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.qa_supervisors
    ADD CONSTRAINT qa_supervisors_pkey PRIMARY KEY (id);


--
-- Name: qa_template_steps qa_template_steps_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.qa_template_steps
    ADD CONSTRAINT qa_template_steps_pkey PRIMARY KEY (id);


--
-- Name: qa_templates qa_templates_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.qa_templates
    ADD CONSTRAINT qa_templates_pkey PRIMARY KEY (id);


--
-- Name: qa_worker_categories qa_worker_categories_code_key; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.qa_worker_categories
    ADD CONSTRAINT qa_worker_categories_code_key UNIQUE (code);


--
-- Name: qa_worker_categories qa_worker_categories_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.qa_worker_categories
    ADD CONSTRAINT qa_worker_categories_pkey PRIMARY KEY (id);


--
-- Name: qa_workers qa_workers_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.qa_workers
    ADD CONSTRAINT qa_workers_pkey PRIMARY KEY (id);


--
-- Name: site_snag_custom_category site_snag_custom_category_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.site_snag_custom_category
    ADD CONSTRAINT site_snag_custom_category_pkey PRIMARY KEY (company_id, name);


--
-- Name: site_snag_drawings site_snag_drawings_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.site_snag_drawings
    ADD CONSTRAINT site_snag_drawings_pkey PRIMARY KEY (id);


--
-- Name: site_snag_highlights site_snag_highlights_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.site_snag_highlights
    ADD CONSTRAINT site_snag_highlights_pkey PRIMARY KEY (id);


--
-- Name: site_snag_measurements site_snag_measurements_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.site_snag_measurements
    ADD CONSTRAINT site_snag_measurements_pkey PRIMARY KEY (id);


--
-- Name: site_snag_prefs site_snag_prefs_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.site_snag_prefs
    ADD CONSTRAINT site_snag_prefs_pkey PRIMARY KEY (company_id);


--
-- Name: site_snag_removed_preset site_snag_removed_preset_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.site_snag_removed_preset
    ADD CONSTRAINT site_snag_removed_preset_pkey PRIMARY KEY (company_id, preset_name);


--
-- Name: site_snags site_snags_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.site_snags
    ADD CONSTRAINT site_snags_pkey PRIMARY KEY (id);


--
-- Name: tasks tasks_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.tasks
    ADD CONSTRAINT tasks_pkey PRIMARY KEY (id);


--
-- Name: material_consumption uq_material_consumption_material_date; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.material_consumption
    ADD CONSTRAINT uq_material_consumption_material_date UNIQUE (material_id, snapshot_date);


--
-- Name: qa_job_templates uq_qa_job_templates; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.qa_job_templates
    ADD CONSTRAINT uq_qa_job_templates UNIQUE (job_id, template_id);


--
-- Name: qa_job_user_workers uq_qa_job_user_workers; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.qa_job_user_workers
    ADD CONSTRAINT uq_qa_job_user_workers UNIQUE (job_id, user_id);


--
-- Name: qa_job_workers uq_qa_job_workers; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.qa_job_workers
    ADD CONSTRAINT uq_qa_job_workers UNIQUE (job_id, worker_id);


--
-- Name: qa_jobs uq_qa_jobs_project_number; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.qa_jobs
    ADD CONSTRAINT uq_qa_jobs_project_number UNIQUE (project_id, job_number);


--
-- Name: users users_email_key; Type: CONSTRAINT; Schema: public; Owner: pg_database_owner
--

ALTER TABLE ONLY public.users
    ADD CONSTRAINT users_email_key UNIQUE (email);


--
-- Name: users users_pkey; Type: CONSTRAINT; Schema: public; Owner: pg_database_owner
--

ALTER TABLE ONLY public.users
    ADD CONSTRAINT users_pkey PRIMARY KEY (id);


--
-- Name: work_hours work_hours_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.work_hours
    ADD CONSTRAINT work_hours_pkey PRIMARY KEY (id);


--
-- Name: work_logs work_logs_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.work_logs
    ADD CONSTRAINT work_logs_pkey PRIMARY KEY (id);


--
-- Name: idx_assignments_project; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_assignments_project ON public.project_assignments USING btree (project_id);


--
-- Name: idx_assignments_user; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_assignments_user ON public.project_assignments USING btree (user_id);


--
-- Name: idx_material_categories_company; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_material_categories_company ON public.material_categories USING btree (company_id);


--
-- Name: idx_material_categories_company_deleted; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_material_categories_company_deleted ON public.material_categories USING btree (company_id, deleted_at);


--
-- Name: idx_material_consumption_company_date; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_material_consumption_company_date ON public.material_consumption USING btree (company_id, snapshot_date);


--
-- Name: idx_material_consumption_project_date; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_material_consumption_project_date ON public.material_consumption USING btree (project_id, snapshot_date);


--
-- Name: idx_material_suppliers_company; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_material_suppliers_company ON public.material_suppliers USING btree (company_id);


--
-- Name: idx_material_suppliers_company_deleted; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_material_suppliers_company_deleted ON public.material_suppliers USING btree (company_id, deleted_at);


--
-- Name: idx_materials_company_deleted; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_materials_company_deleted ON public.materials USING btree (company_id, deleted_at);


--
-- Name: idx_materials_project; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_materials_project ON public.materials USING btree (project_id);


--
-- Name: idx_materials_project_deleted; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_materials_project_deleted ON public.materials USING btree (project_id, deleted_at);


--
-- Name: idx_operative_task_photos_lookup; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_operative_task_photos_lookup ON public.operative_task_photos USING btree (user_id, task_source, task_id);


--
-- Name: idx_planning_plan_tasks_deadline; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_planning_plan_tasks_deadline ON public.planning_plan_tasks USING btree (deadline);


--
-- Name: idx_planning_plan_tasks_plan_id; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_planning_plan_tasks_plan_id ON public.planning_plan_tasks USING btree (plan_id);


--
-- Name: idx_planning_plan_tasks_qa_job_id; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_planning_plan_tasks_qa_job_id ON public.planning_plan_tasks USING btree (qa_job_id);


--
-- Name: idx_planning_plan_tasks_status; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_planning_plan_tasks_status ON public.planning_plan_tasks USING btree (status);


--
-- Name: idx_planning_plans_company; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_planning_plans_company ON public.planning_plans USING btree (company_id, created_at DESC);


--
-- Name: idx_planning_plans_dates; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_planning_plans_dates ON public.planning_plans USING btree (start_date, end_date);


--
-- Name: idx_proconix_admin_active; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_proconix_admin_active ON public.proconix_admin USING btree (active) WHERE (active = true);


--
-- Name: idx_proconix_admin_email; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_proconix_admin_email ON public.proconix_admin USING btree (email);


--
-- Name: idx_project_assignments_project; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_project_assignments_project ON public.project_assignments USING btree (project_id);


--
-- Name: idx_project_assignments_user; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_project_assignments_user ON public.project_assignments USING btree (user_id);


--
-- Name: idx_projects_company_id; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_projects_company_id ON public.projects USING btree (company_id);


--
-- Name: idx_qa_floors_project_id; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_qa_floors_project_id ON public.qa_floors USING btree (project_id);


--
-- Name: idx_qa_job_templates_job; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_qa_job_templates_job ON public.qa_job_templates USING btree (job_id);


--
-- Name: idx_qa_job_templates_template; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_qa_job_templates_template ON public.qa_job_templates USING btree (template_id);


--
-- Name: idx_qa_job_user_workers_job; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_qa_job_user_workers_job ON public.qa_job_user_workers USING btree (job_id);


--
-- Name: idx_qa_job_user_workers_user; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_qa_job_user_workers_user ON public.qa_job_user_workers USING btree (user_id);


--
-- Name: idx_qa_job_workers_job; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_qa_job_workers_job ON public.qa_job_workers USING btree (job_id);


--
-- Name: idx_qa_job_workers_worker; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_qa_job_workers_worker ON public.qa_job_workers USING btree (worker_id);


--
-- Name: idx_qa_jobs_project_id; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_qa_jobs_project_id ON public.qa_jobs USING btree (project_id);


--
-- Name: idx_qa_jobs_responsible_user_id; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_qa_jobs_responsible_user_id ON public.qa_jobs USING btree (responsible_user_id);


--
-- Name: idx_qa_jobs_status_id; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_qa_jobs_status_id ON public.qa_jobs USING btree (status_id);


--
-- Name: idx_qa_jobs_target_date; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_qa_jobs_target_date ON public.qa_jobs USING btree (target_completion_date);


--
-- Name: idx_qa_supervisors_company_id; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_qa_supervisors_company_id ON public.qa_supervisors USING btree (company_id);


--
-- Name: idx_qa_template_steps_template_id; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_qa_template_steps_template_id ON public.qa_template_steps USING btree (template_id);


--
-- Name: idx_qa_templates_company_id; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_qa_templates_company_id ON public.qa_templates USING btree (company_id);


--
-- Name: idx_qa_templates_project_id; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_qa_templates_project_id ON public.qa_templates USING btree (project_id);


--
-- Name: idx_qa_workers_category_id; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_qa_workers_category_id ON public.qa_workers USING btree (category_id);


--
-- Name: idx_qa_workers_company_id; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_qa_workers_company_id ON public.qa_workers USING btree (company_id);


--
-- Name: idx_site_snag_drawings_company; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_site_snag_drawings_company ON public.site_snag_drawings USING btree (company_id);


--
-- Name: idx_site_snag_drawings_project; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_site_snag_drawings_project ON public.site_snag_drawings USING btree (project_id);


--
-- Name: idx_site_snag_highlights_drawing; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_site_snag_highlights_drawing ON public.site_snag_highlights USING btree (drawing_id);


--
-- Name: idx_site_snag_measurements_drawing; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_site_snag_measurements_drawing ON public.site_snag_measurements USING btree (drawing_id);


--
-- Name: idx_site_snags_drawing; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_site_snags_drawing ON public.site_snags USING btree (drawing_id);


--
-- Name: idx_tasks_status; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_tasks_status ON public.tasks USING btree (status);


--
-- Name: idx_tasks_user_id; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_tasks_user_id ON public.tasks USING btree (user_id);


--
-- Name: idx_users_project_id; Type: INDEX; Schema: public; Owner: pg_database_owner
--

CREATE INDEX idx_users_project_id ON public.users USING btree (project_id);


--
-- Name: idx_work_hours_clock_in; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_work_hours_clock_in ON public.work_hours USING btree (clock_in);


--
-- Name: idx_work_hours_user_id; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_work_hours_user_id ON public.work_hours USING btree (user_id);


--
-- Name: idx_work_logs_archived; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_work_logs_archived ON public.work_logs USING btree (archived);


--
-- Name: idx_work_logs_company_id; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_work_logs_company_id ON public.work_logs USING btree (company_id);


--
-- Name: idx_work_logs_job_display_id_company; Type: INDEX; Schema: public; Owner: postgres
--

CREATE UNIQUE INDEX idx_work_logs_job_display_id_company ON public.work_logs USING btree (company_id, job_display_id);


--
-- Name: idx_work_logs_operative_archived; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_work_logs_operative_archived ON public.work_logs USING btree (operative_archived);


--
-- Name: idx_work_logs_status; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_work_logs_status ON public.work_logs USING btree (status);


--
-- Name: idx_work_logs_submitted_at; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_work_logs_submitted_at ON public.work_logs USING btree (submitted_at);


--
-- Name: idx_work_logs_submitted_by; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_work_logs_submitted_by ON public.work_logs USING btree (submitted_by_user_id);


--
-- Name: companies fk_company_created_by_manager; Type: FK CONSTRAINT; Schema: public; Owner: pg_database_owner
--

ALTER TABLE ONLY public.companies
    ADD CONSTRAINT fk_company_created_by_manager FOREIGN KEY (created_by_manager_id) REFERENCES public.manager(id) ON DELETE SET NULL;


--
-- Name: material_consumption fk_material_consumption_material; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.material_consumption
    ADD CONSTRAINT fk_material_consumption_material FOREIGN KEY (material_id) REFERENCES public.materials(id) ON DELETE CASCADE;


--
-- Name: materials fk_materials_category; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.materials
    ADD CONSTRAINT fk_materials_category FOREIGN KEY (category_id) REFERENCES public.material_categories(id) ON DELETE SET NULL;


--
-- Name: materials fk_materials_project; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.materials
    ADD CONSTRAINT fk_materials_project FOREIGN KEY (project_id) REFERENCES public.projects(id) ON DELETE CASCADE;


--
-- Name: materials fk_materials_supplier; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.materials
    ADD CONSTRAINT fk_materials_supplier FOREIGN KEY (supplier_id) REFERENCES public.material_suppliers(id) ON DELETE SET NULL;


--
-- Name: manager manager_company_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: pg_database_owner
--

ALTER TABLE ONLY public.manager
    ADD CONSTRAINT manager_company_id_fkey FOREIGN KEY (company_id) REFERENCES public.companies(id) ON DELETE CASCADE;


--
-- Name: planning_plan_tasks planning_plan_tasks_plan_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.planning_plan_tasks
    ADD CONSTRAINT planning_plan_tasks_plan_id_fkey FOREIGN KEY (plan_id) REFERENCES public.planning_plans(id) ON DELETE CASCADE;


--
-- Name: project_assignments project_assignments_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.project_assignments
    ADD CONSTRAINT project_assignments_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE;


--
-- Name: projects projects_company_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.projects
    ADD CONSTRAINT projects_company_id_fkey FOREIGN KEY (company_id) REFERENCES public.companies(id) ON DELETE CASCADE;


--
-- Name: qa_floors qa_floors_project_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.qa_floors
    ADD CONSTRAINT qa_floors_project_id_fkey FOREIGN KEY (project_id) REFERENCES public.projects(id) ON DELETE SET NULL;


--
-- Name: qa_job_templates qa_job_templates_job_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.qa_job_templates
    ADD CONSTRAINT qa_job_templates_job_id_fkey FOREIGN KEY (job_id) REFERENCES public.qa_jobs(id) ON DELETE CASCADE;


--
-- Name: qa_job_templates qa_job_templates_template_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.qa_job_templates
    ADD CONSTRAINT qa_job_templates_template_id_fkey FOREIGN KEY (template_id) REFERENCES public.qa_templates(id) ON DELETE CASCADE;


--
-- Name: qa_job_user_workers qa_job_user_workers_job_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.qa_job_user_workers
    ADD CONSTRAINT qa_job_user_workers_job_id_fkey FOREIGN KEY (job_id) REFERENCES public.qa_jobs(id) ON DELETE CASCADE;


--
-- Name: qa_job_user_workers qa_job_user_workers_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.qa_job_user_workers
    ADD CONSTRAINT qa_job_user_workers_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE;


--
-- Name: qa_job_workers qa_job_workers_job_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.qa_job_workers
    ADD CONSTRAINT qa_job_workers_job_id_fkey FOREIGN KEY (job_id) REFERENCES public.qa_jobs(id) ON DELETE CASCADE;


--
-- Name: qa_job_workers qa_job_workers_worker_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.qa_job_workers
    ADD CONSTRAINT qa_job_workers_worker_id_fkey FOREIGN KEY (worker_id) REFERENCES public.qa_workers(id) ON DELETE CASCADE;


--
-- Name: qa_jobs qa_jobs_cost_type_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.qa_jobs
    ADD CONSTRAINT qa_jobs_cost_type_id_fkey FOREIGN KEY (cost_type_id) REFERENCES public.qa_cost_types(id);


--
-- Name: qa_jobs qa_jobs_floor_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.qa_jobs
    ADD CONSTRAINT qa_jobs_floor_id_fkey FOREIGN KEY (floor_id) REFERENCES public.qa_floors(id);


--
-- Name: qa_jobs qa_jobs_project_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.qa_jobs
    ADD CONSTRAINT qa_jobs_project_id_fkey FOREIGN KEY (project_id) REFERENCES public.projects(id) ON DELETE CASCADE;


--
-- Name: qa_jobs qa_jobs_responsible_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.qa_jobs
    ADD CONSTRAINT qa_jobs_responsible_id_fkey FOREIGN KEY (responsible_id) REFERENCES public.qa_supervisors(id);


--
-- Name: qa_jobs qa_jobs_responsible_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.qa_jobs
    ADD CONSTRAINT qa_jobs_responsible_user_id_fkey FOREIGN KEY (responsible_user_id) REFERENCES public.users(id) ON DELETE SET NULL;


--
-- Name: qa_jobs qa_jobs_status_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.qa_jobs
    ADD CONSTRAINT qa_jobs_status_id_fkey FOREIGN KEY (status_id) REFERENCES public.qa_job_statuses(id);


--
-- Name: qa_template_steps qa_template_steps_template_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.qa_template_steps
    ADD CONSTRAINT qa_template_steps_template_id_fkey FOREIGN KEY (template_id) REFERENCES public.qa_templates(id) ON DELETE CASCADE;


--
-- Name: qa_templates qa_templates_company_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.qa_templates
    ADD CONSTRAINT qa_templates_company_id_fkey FOREIGN KEY (company_id) REFERENCES public.companies(id) ON DELETE CASCADE;


--
-- Name: qa_templates qa_templates_project_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.qa_templates
    ADD CONSTRAINT qa_templates_project_id_fkey FOREIGN KEY (project_id) REFERENCES public.projects(id) ON DELETE CASCADE;


--
-- Name: qa_workers qa_workers_category_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.qa_workers
    ADD CONSTRAINT qa_workers_category_id_fkey FOREIGN KEY (category_id) REFERENCES public.qa_worker_categories(id);


--
-- Name: site_snag_custom_category site_snag_custom_category_company_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.site_snag_custom_category
    ADD CONSTRAINT site_snag_custom_category_company_id_fkey FOREIGN KEY (company_id) REFERENCES public.companies(id) ON DELETE CASCADE;


--
-- Name: site_snag_drawings site_snag_drawings_company_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.site_snag_drawings
    ADD CONSTRAINT site_snag_drawings_company_id_fkey FOREIGN KEY (company_id) REFERENCES public.companies(id) ON DELETE CASCADE;


--
-- Name: site_snag_drawings site_snag_drawings_project_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.site_snag_drawings
    ADD CONSTRAINT site_snag_drawings_project_id_fkey FOREIGN KEY (project_id) REFERENCES public.projects(id) ON DELETE CASCADE;


--
-- Name: site_snag_highlights site_snag_highlights_drawing_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.site_snag_highlights
    ADD CONSTRAINT site_snag_highlights_drawing_id_fkey FOREIGN KEY (drawing_id) REFERENCES public.site_snag_drawings(id) ON DELETE CASCADE;


--
-- Name: site_snag_measurements site_snag_measurements_drawing_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.site_snag_measurements
    ADD CONSTRAINT site_snag_measurements_drawing_id_fkey FOREIGN KEY (drawing_id) REFERENCES public.site_snag_drawings(id) ON DELETE CASCADE;


--
-- Name: site_snag_prefs site_snag_prefs_company_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.site_snag_prefs
    ADD CONSTRAINT site_snag_prefs_company_id_fkey FOREIGN KEY (company_id) REFERENCES public.companies(id) ON DELETE CASCADE;


--
-- Name: site_snag_removed_preset site_snag_removed_preset_company_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.site_snag_removed_preset
    ADD CONSTRAINT site_snag_removed_preset_company_id_fkey FOREIGN KEY (company_id) REFERENCES public.companies(id) ON DELETE CASCADE;


--
-- Name: site_snags site_snags_assignee_manager_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.site_snags
    ADD CONSTRAINT site_snags_assignee_manager_id_fkey FOREIGN KEY (assignee_manager_id) REFERENCES public.manager(id) ON DELETE SET NULL;


--
-- Name: site_snags site_snags_assignee_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.site_snags
    ADD CONSTRAINT site_snags_assignee_user_id_fkey FOREIGN KEY (assignee_user_id) REFERENCES public.users(id) ON DELETE SET NULL;


--
-- Name: site_snags site_snags_drawing_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.site_snags
    ADD CONSTRAINT site_snags_drawing_id_fkey FOREIGN KEY (drawing_id) REFERENCES public.site_snag_drawings(id) ON DELETE CASCADE;


--
-- Name: users users_company_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: pg_database_owner
--

ALTER TABLE ONLY public.users
    ADD CONSTRAINT users_company_id_fkey FOREIGN KEY (company_id) REFERENCES public.companies(id) ON DELETE CASCADE;


--
-- PostgreSQL database dump complete
--

\unrestrict 86768XG0kd0hujyjpaS3nqnJGaeyF21HgmAQc5fgVB1A6sDrFckeC1xuAD8A3J3

