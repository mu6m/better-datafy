CREATE OR REPLACE FUNCTION check_order_quantity()
RETURNS TRIGGER AS $$
BEGIN
    IF NEW.quantity > (SELECT quantity FROM products WHERE id = NEW.product_id) THEN
        RAISE EXCEPTION 'Not enough stock for product %', NEW.product_id;
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER cart_quantity_check
BEFORE INSERT OR UPDATE ON cart_items
FOR EACH ROW
EXECUTE FUNCTION check_order_quantity();

-- show triggers

SELECT * FROM information_schema.triggers;

-- drop triggers

CREATE OR REPLACE FUNCTION strip_all_triggers() RETURNS text AS $$ DECLARE
    triggNameRecord RECORD;
    triggTableRecord RECORD;
BEGIN
    FOR triggNameRecord IN select distinct(trigger_name) from information_schema.triggers where trigger_schema = 'public' LOOP
        FOR triggTableRecord IN SELECT distinct(event_object_table) from information_schema.triggers where trigger_name = triggNameRecord.trigger_name LOOP
            RAISE NOTICE 'Dropping trigger: % on table: %', triggNameRecord.trigger_name, triggTableRecord.event_object_table;
            EXECUTE 'DROP TRIGGER ' || triggNameRecord.trigger_name || ' ON ' || triggTableRecord.event_object_table || ';';
        END LOOP;
    END LOOP;

    RETURN 'done';
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

select strip_all_triggers();